package io.github.mariyaz0.handtonose

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.HandlerThread
import android.os.Process
import android.os.SystemClock
import io.github.mariyaz0.handtonose.core.CsvFormat
import java.io.BufferedWriter
import java.io.File
import java.io.FileWriter

/**
 * Writes raw accelerometer and gyroscope samples to acc.csv / gyro.csv.
 * Callbacks run on a dedicated background thread, so UI work cannot delay or drop samples.
 * Timestamps are SensorEvent.timestamp (hardware time, ns). The clock check below verifies
 * that they share the time base of SystemClock.elapsedRealtimeNanos(), which stamps the cues.
 */
class SensorRecorder(
    context: Context,
    private val dir: File,
    private val samplingPeriodUs: Int,
    private val onAccuracy: (sensor: String, accuracy: Int) -> Unit,
) : SensorEventListener {

    private val manager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    val accelerometer: Sensor? = manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    val gyroscope: Sensor? = manager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)

    private var thread: HandlerThread? = null
    private var accWriter: BufferedWriter? = null
    private var gyroWriter: BufferedWriter? = null
    private val lineBuffer = StringBuilder(64)

    private val clockDiffs = LongArray(1000)
    private var nClockDiffs = 0

    private val stats = mapOf("acc" to Stats(), "gyro" to Stats())

    private class Stats {
        var count = 0L
        var firstNs = 0L
        var lastNs = 0L
        fun add(t: Long) {
            if (count == 0L) firstNs = t
            lastNs = t
            count++
        }
        fun rateHz(): Double = if (count < 2) Double.NaN else (count - 1) * 1e9 / (lastNs - firstNs)
    }

    fun hasRequiredSensors(): Boolean = accelerometer != null && gyroscope != null

    fun start() {
        check(hasRequiredSensors()) { "accelerometer or gyroscope missing" }
        accWriter = openCsv("acc.csv")
        gyroWriter = openCsv("gyro.csv")
        val t = HandlerThread("sensor-writer", Process.THREAD_PRIORITY_URGENT_DISPLAY).also { it.start() }
        thread = t
        val handler = Handler(t.looper)
        manager.registerListener(this, accelerometer, samplingPeriodUs, handler)
        manager.registerListener(this, gyroscope, samplingPeriodUs, handler)
    }

    fun stop() {
        manager.unregisterListener(this)
        thread?.let {
            it.quitSafely()
            it.join(2000)
        }
        thread = null
        accWriter?.close(); accWriter = null
        gyroWriter?.close(); gyroWriter = null
    }

    private fun openCsv(name: String): BufferedWriter =
        BufferedWriter(FileWriter(File(dir, name)), 1 shl 16).apply {
            write(CsvFormat.IMU_HEADER)
            newLine()
        }

    override fun onSensorChanged(event: SensorEvent) {
        val receivedNs = SystemClock.elapsedRealtimeNanos()
        val (writer, key) = when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> accWriter to "acc"
            Sensor.TYPE_GYROSCOPE -> gyroWriter to "gyro"
            else -> return
        }
        if (writer == null) return
        if (nClockDiffs < clockDiffs.size) clockDiffs[nClockDiffs++] = receivedNs - event.timestamp
        stats.getValue(key).add(event.timestamp)
        val v = event.values
        writer.write(CsvFormat.imuLine(lineBuffer, event.timestamp, v[0], v[1], v[2]))
        writer.newLine()
    }

    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {
        onAccuracy(sensor.stringType ?: sensor.name, accuracy)
    }

    /** Call after stop() (or accept a slightly stale snapshot). */
    fun summary(): Map<String, Any?> = linkedMapOf(
        "sample_counts" to stats.mapValues { it.value.count },
        "effective_rate_hz" to stats.mapValues { it.value.rateHz() },
        "clock_check" to clockCheck(),
    )

    private fun clockCheck(): Map<String, Any?> {
        if (nClockDiffs == 0) return mapOf("n" to 0)
        val d = clockDiffs.copyOf(nClockDiffs).also { it.sort() }
        return linkedMapOf(
            "description" to "elapsedRealtimeNanos at callback minus SensorEvent.timestamp, first ${d.size} samples",
            "n" to d.size,
            "median_ns" to d[d.size / 2],
            "min_ns" to d.first(),
            "max_ns" to d.last(),
            "same_time_base" to (Math.abs(d[d.size / 2]) < 1_000_000_000L),
        )
    }

    fun sensorInfo(): Map<String, Any?> = linkedMapOf(
        "accelerometer" to info(accelerometer),
        "gyroscope" to info(gyroscope),
    )

    private fun info(s: Sensor?): Map<String, Any?>? = s?.let {
        linkedMapOf(
            "name" to it.name,
            "vendor" to it.vendor,
            "version" to it.version,
            "type" to it.stringType,
            "resolution" to it.resolution,
            "max_range" to it.maximumRange,
            "min_delay_us" to it.minDelay,
            "max_delay_us" to it.maxDelay,
            "fifo_max_event_count" to it.fifoMaxEventCount,
            "power_ma" to it.power,
        )
    }
}
