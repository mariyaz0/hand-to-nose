package io.github.mariyaz0.handtonose

import android.content.ContentValues
import android.content.Context
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import io.github.mariyaz0.handtonose.core.EhiAnswer
import io.github.mariyaz0.handtonose.core.EhiShortForm
import io.github.mariyaz0.handtonose.core.Json
import io.github.mariyaz0.handtonose.core.SCHEMA_VERSION
import io.github.mariyaz0.handtonose.core.SessionPlan
import io.github.mariyaz0.handtonose.core.toJsonMap
import java.io.BufferedOutputStream
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

data class Participant(
    val id: String,
    val age: Int?,
    val sex: String?,
    val ehiAnswers: List<EhiAnswer>,
) {
    val lq: Double get() = EhiShortForm.laterality(ehiAnswers)
}

/** One recording session: its folder, files, recorder and progress. */
class Session(
    private val context: Context,
    val plan: SessionPlan,
    val participant: Participant,
    val dir: File,
    private val audioSampleRate: Int,
) {
    val events = EventLog(File(dir, "events.csv"))
    val recorder = SensorRecorder(context, dir, plan.config.samplingPeriodUs) { sensor, accuracy ->
        events.log(io.github.mariyaz0.handtonose.core.Events.SENSOR_ACCURACY, note = "$sensor=$accuracy")
    }

    var blockIndex = 0
    val attempts = IntArray(plan.blocks.size)
    val completed = sortedSetOf<Int>()
    val skipped = sortedSetOf<Int>()
    var finished = false
    val startedAt: String = isoNow()
    var endedAt: String? = null

    fun writeMeta() {
        File(dir, "session.json").writeText(Json.write(meta()) + "\n")
    }

    private fun meta(): Map<String, Any?> {
        val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        return linkedMapOf(
            "schema_version" to SCHEMA_VERSION,
            "app" to linkedMapOf("name" to "HandToNose", "version" to appVersion(context)),
            "participant" to linkedMapOf(
                "id" to participant.id,
                "age" to participant.age,
                "sex" to participant.sex,
                "ehi_sf" to linkedMapOf(
                    "instrument" to "Edinburgh Handedness Inventory - Short Form (Veale 2014)",
                    "items" to EhiShortForm.items,
                    "answers" to participant.ehiAnswers.map { it.name.lowercase() },
                    "scores" to participant.ehiAnswers.map { it.score },
                    "laterality_quotient" to participant.lq,
                    "category" to EhiShortForm.category(participant.lq),
                    "dominant_hand" to EhiShortForm.dominantHand(participant.lq).label,
                ),
            ),
            "started_at" to startedAt,
            "ended_at" to endedAt,
            "time_base" to "t_ns in all CSV files: SensorEvent.timestamp / SystemClock.elapsedRealtimeNanos (ns since boot)",
            "device" to linkedMapOf(
                "manufacturer" to Build.MANUFACTURER,
                "model" to Build.MODEL,
                "android_release" to Build.VERSION.RELEASE,
                "sdk_int" to Build.VERSION.SDK_INT,
            ),
            "audio" to linkedMapOf(
                "sample_rate_hz" to audioSampleRate,
                "output_frames_per_buffer" to audio.getProperty(AudioManager.PROPERTY_OUTPUT_FRAMES_PER_BUFFER),
                "cue_to_nose_hz" to Cue.TO_NOSE.freqHz,
                "cue_from_nose_hz" to Cue.FROM_NOSE.freqHz,
                "cue_duration_ms" to CuePlayer.CUE_DURATION_MS,
                "note" to "cue t_ns is the time playback was requested; acoustic onset = t_ns + output latency (measure per phone)",
            ),
            "sensors" to recorder.sensorInfo(),
            "requested_sampling_period_us" to plan.config.samplingPeriodUs,
            "recording" to recorder.summary(),
            "plan" to plan.toJsonMap(),
            "progress" to linkedMapOf(
                "completed_blocks" to completed.toList(),
                "skipped_blocks" to skipped.toList(),
                "attempts" to attempts.toList(),
                "finished" to finished,
            ),
        )
    }

    companion object {
        fun create(context: Context, plan: SessionPlan, participant: Participant, audioSampleRate: Int): Session {
            val base = context.getExternalFilesDir(null) ?: context.filesDir
            val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
            val dir = File(base, "sessions/${participant.id}_$stamp").apply { mkdirs() }
            return Session(context, plan, participant, dir, audioSampleRate)
        }

        fun isoNow(): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US).format(Date())

        fun appVersion(context: Context): String =
            runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull() ?: "?"
    }
}

/** Zips a session folder straight into Download/HandToNose/ (MediaStore, no permissions needed). */
object Exporter {
    fun exportZip(context: Context, dir: File): Uri {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, dir.name + ".zip")
            put(MediaStore.MediaColumns.MIME_TYPE, "application/zip")
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/HandToNose")
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw IllegalStateException("Could not create the file in Downloads")
        try {
            val os = resolver.openOutputStream(uri) ?: throw IllegalStateException("Could not open the file in Downloads")
            ZipOutputStream(BufferedOutputStream(os)).use { zip ->
                dir.listFiles().orEmpty().filter { it.isFile }.sortedBy { it.name }.forEach { f ->
                    zip.putNextEntry(ZipEntry(dir.name + "/" + f.name))
                    f.inputStream().use { it.copyTo(zip) }
                    zip.closeEntry()
                }
            }
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            throw e
        }
        return uri
    }
}
