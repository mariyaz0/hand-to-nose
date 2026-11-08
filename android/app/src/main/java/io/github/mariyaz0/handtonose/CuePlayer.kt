package io.github.mariyaz0.handtonose

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.SystemClock
import kotlin.math.PI
import kotlin.math.min
import kotlin.math.sin

enum class Cue(val freqHz: Double) {
    TO_NOSE(1000.0),   // high beep: "go to the nose"
    FROM_NOSE(600.0),  // low beep: "go back"
}

/**
 * Plays the two cue beeps from pre-rendered PCM (static AudioTrack, low-latency mode).
 * play() returns the elapsedRealtimeNanos() taken right before playback is requested.
 * The real sound comes out some milliseconds later (output latency): it is not known
 * from software and must be measured once per phone (docs/validation_video.md).
 */
class CuePlayer {
    val sampleRate: Int = AudioTrack.getNativeOutputSampleRate(AudioManager.STREAM_MUSIC).takeIf { it > 0 } ?: 48000

    private val tracks: Map<Cue, AudioTrack> = Cue.entries.associateWith { build(it.freqHz) }

    private fun tone(freqHz: Double): ShortArray {
        val n = sampleRate * CUE_DURATION_MS / 1000
        val ramp = sampleRate * 5 / 1000 // 5 ms fade in/out avoids clicks
        return ShortArray(n) { i ->
            val env = min(1.0, min(i.toDouble() / ramp, (n - 1 - i).toDouble() / ramp))
            (0.8 * Short.MAX_VALUE * env * sin(2 * PI * freqHz * i / sampleRate)).toInt().toShort()
        }
    }

    private fun build(freqHz: Double): AudioTrack {
        val pcm = tone(freqHz)
        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sampleRate)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setBufferSizeInBytes(pcm.size * 2)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
            .build()
        track.write(pcm, 0, pcm.size)
        return track
    }

    @Synchronized
    fun play(cue: Cue): Long {
        val track = tracks.getValue(cue)
        try {
            track.stop()
        } catch (_: IllegalStateException) {
            // not playing yet: fine
        }
        track.reloadStaticData()
        val t = SystemClock.elapsedRealtimeNanos()
        track.play()
        return t
    }

    fun release() {
        tracks.values.forEach { it.release() }
    }

    companion object {
        const val CUE_DURATION_MS = 120
    }
}
