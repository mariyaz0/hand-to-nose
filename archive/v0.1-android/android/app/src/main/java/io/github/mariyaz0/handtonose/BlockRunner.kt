package io.github.mariyaz0.handtonose

import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.Process
import android.os.SystemClock
import io.github.mariyaz0.handtonose.core.BlockPlan
import io.github.mariyaz0.handtonose.core.Events
import io.github.mariyaz0.handtonose.core.TrialPlan
import java.io.BufferedWriter
import java.io.File
import java.io.FileWriter
import io.github.mariyaz0.handtonose.core.CsvFormat

/** Thread-safe writer for events.csv. Events are stamped with elapsedRealtimeNanos(). */
class EventLog(file: File) {
    private val writer = BufferedWriter(FileWriter(file)).apply {
        write(CsvFormat.EVENTS_HEADER)
        newLine()
    }
    private var closed = false

    @Synchronized
    fun log(
        event: String,
        block: BlockPlan? = null,
        attempt: Int? = null,
        trial: TrialPlan? = null,
        note: String = "",
        tNs: Long = SystemClock.elapsedRealtimeNanos(),
    ) {
        if (closed) return
        writer.write(
            CsvFormat.eventLine(tNs, event, block?.index, attempt, trial?.index, trial?.isPractice, block?.condition, note)
        )
        writer.newLine()
    }

    @Synchronized
    fun flush() { if (!closed) writer.flush() }

    @Synchronized
    fun close() {
        if (!closed) { writer.close(); closed = true }
    }
}

/**
 * Runs one block: for each trial, "keep still" -> random foreperiod -> HIGH beep (to nose)
 * -> random hold -> LOW beep (back) -> rest. The whole timeline is posted up front on a
 * dedicated timer thread; every action is logged with the time it really happened.
 */
class BlockRunner(
    private val block: BlockPlan,
    private val attempt: Int,
    private val cues: CuePlayer,
    private val events: EventLog,
    private val listener: Listener,
) {
    interface Listener {
        fun onStatus(status: String, detail: String)
        fun onBlockFinished(block: BlockPlan)
        fun onBlockAborted(block: BlockPlan, reason: String)
    }

    private val thread = HandlerThread("cue-timer", Process.THREAD_PRIORITY_URGENT_AUDIO).also { it.start() }
    private val timer = Handler(thread.looper)
    private val main = Handler(Looper.getMainLooper())

    /** Only touched on the timer thread (plus a volatile read in isRunning). */
    @Volatile private var done = false

    val isRunning: Boolean get() = !done

    fun start() {
        timer.post {
            events.log(Events.BLOCK_START, block, attempt)
            ui("Get ready", "Arm straight forward, keep still")
        }
        var t = SystemClock.uptimeMillis() + LEAD_IN_MS
        for (trial in block.trials) {
            val label = "Trial ${trial.index + 1}/${block.trials.size}" + if (trial.isPractice) " (practice)" else ""
            at(t) {
                events.log(Events.TRIAL_START, block, attempt, trial)
                ui("Keep still", label)
            }
            t += trial.foreperiodMs
            at(t) {
                val ts = cues.play(Cue.TO_NOSE)
                events.log(Events.CUE_TO_NOSE, block, attempt, trial, tNs = ts)
                ui("TO NOSE", label)
            }
            t += trial.holdMs
            at(t) {
                val ts = cues.play(Cue.FROM_NOSE)
                events.log(Events.CUE_FROM_NOSE, block, attempt, trial, tNs = ts)
                ui("BACK", label)
            }
            t += trial.restMs
            at(t) { events.log(Events.TRIAL_END, block, attempt, trial) }
        }
        at(t + 300) {
            events.log(Events.BLOCK_END, block, attempt)
            events.flush()
            done = true
            thread.quitSafely()
            main.post { listener.onBlockFinished(block) }
        }
    }

    /** Safe to call from any thread, any number of times. */
    fun cancel(reason: String) {
        if (done) return
        timer.postAtFrontOfQueue {
            if (done) return@postAtFrontOfQueue
            done = true
            timer.removeCallbacksAndMessages(null)
            events.log(Events.BLOCK_ABORTED, block, attempt, note = reason)
            events.flush()
            thread.quitSafely()
            main.post { listener.onBlockAborted(block, reason) }
        }
    }

    private fun at(uptimeMs: Long, action: () -> Unit) {
        timer.postAtTime({ if (!done) action() }, uptimeMs)
    }

    private fun ui(status: String, detail: String) {
        main.post { listener.onStatus(status, detail) }
    }

    companion object {
        const val LEAD_IN_MS = 2000L
    }
}
