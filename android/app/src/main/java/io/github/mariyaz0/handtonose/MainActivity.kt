package io.github.mariyaz0.handtonose

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.TextView
import io.github.mariyaz0.handtonose.core.BlockPlan
import io.github.mariyaz0.handtonose.core.EhiAnswer
import io.github.mariyaz0.handtonose.core.EhiShortForm
import io.github.mariyaz0.handtonose.core.Events
import io.github.mariyaz0.handtonose.core.Grip
import io.github.mariyaz0.handtonose.core.ProtocolConfig
import io.github.mariyaz0.handtonose.core.Scheduler
import io.github.mariyaz0.handtonose.core.Speed
import java.util.Locale

/**
 * Screens: Setup -> (Block intro -> Running) x N -> Done.
 * Orientation is locked in the manifest so tilting the phone never restarts the activity mid-block.
 */
class MainActivity : Activity(), BlockRunner.Listener {

    private lateinit var cues: CuePlayer
    private val main = Handler(Looper.getMainLooper())
    private var session: Session? = null
    private var runner: BlockRunner? = null

    private var statusView: TextView? = null
    private var detailView: TextView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        volumeControlStream = AudioManager.STREAM_MUSIC
        cues = CuePlayer()
        showSetup()
    }

    override fun onPause() {
        super.onPause()
        // Leaving the app mid-block invalidates the block; it can be repeated afterwards.
        runner?.cancel("app_paused")
    }

    override fun onDestroy() {
        runner?.cancel("app_destroyed")
        session?.let { s ->
            if (!s.finished) {
                s.recorder.stop()
                s.events.log(Events.SESSION_END, note = "app_destroyed")
                s.events.close()
                s.writeMeta()
            }
        }
        cues.release()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (session == null || session?.finished == true) {
            @Suppress("DEPRECATION")
            super.onBackPressed()
            return
        }
        AlertDialog.Builder(this)
            .setMessage("Finish the session now? Completed blocks are kept.")
            .setPositiveButton("Finish") { _, _ ->
                runner?.cancel("finished_early")
                finishSession()
            }
            .setNegativeButton("Continue", null)
            .show()
    }

    // ---------------------------------------------------------------- setup

    private fun showSetup() = screen {
        text("Hand-to-Nose recorder", 24f, bold = true)
        text("v${Session.appVersion(this@MainActivity)} · accelerometer + gyroscope, up to 200 Hz", 13f, color = MUTED_COLOR)

        section("Participant")
        val idField = edit("Participant ID, e.g. P001 (no names)")
        val ageField = edit("Age in years (optional)", numeric = true)
        text("Sex (optional)", 14f)
        val sexOptions = listOf("female", "male", "other", "prefer not to say")
        val sexChoice = choice(sexOptions)

        section("Handedness")
        text("Edinburgh Handedness Inventory - Short Form. Which hand do you use for…", 14f)
        val ehiChoices = EhiShortForm.items.map { item ->
            text(item, 15f, bold = true)
            choice(EhiAnswer.entries.map { it.label })
        }

        section("Protocol")
        val trialsField = edit("Trials per block", numeric = true, initial = "10")
        val practiceField = edit("Practice trials per block", numeric = true, initial = "2")
        text("Speeds", 14f)
        val speedChecks = Speed.entries.map { check("${it.label} — ${it.instruction}", true) }
        text("Phone grips", 14f)
        val gripChecks = Grip.entries.map { check("${it.label} — ${it.instruction}", true) }

        section("Before you start")
        text("Turn the media volume up and test both beeps: HIGH = to the nose, LOW = back.", 14f)
        button("Test sounds") {
            cues.play(Cue.TO_NOSE)
            main.postDelayed({ cues.play(Cue.FROM_NOSE) }, 700)
        }
        val error = text("", 14f, color = ERROR_COLOR)

        button("Start session") {
            val problems = mutableListOf<String>()
            val id = idField.text.toString().trim()
            if (!Scheduler.isValidParticipantId(id)) problems += "Participant ID: 1-32 letters, digits, _ or -"
            val ageText = ageField.text.toString().trim()
            val age = ageText.toIntOrNull()
            if (ageText.isNotEmpty() && (age == null || age !in 5..120)) problems += "Age looks wrong"
            val ehi = ehiChoices.map { it.index }
            if (ehi.any { it < 0 }) problems += "Answer all four handedness questions"
            val trials = trialsField.text.toString().toIntOrNull()
            if (trials == null || trials !in 1..100) problems += "Trials per block: 1-100"
            val practice = practiceField.text.toString().toIntOrNull()
            if (practice == null || practice !in 0..10) problems += "Practice trials: 0-10"
            val speeds = Speed.entries.filterIndexed { i, _ -> speedChecks[i].isChecked }
            val grips = Grip.entries.filterIndexed { i, _ -> gripChecks[i].isChecked }
            if (speeds.isEmpty()) problems += "Select at least one speed"
            if (grips.isEmpty()) problems += "Select at least one grip"
            if (problems.isNotEmpty()) {
                error.text = problems.joinToString("\n")
                return@button
            }
            val participant = Participant(
                id = id,
                age = age,
                sex = sexChoice.index.takeIf { it >= 0 }?.let { sexOptions[it] },
                ehiAnswers = ehi.map { EhiAnswer.entries[it] },
            )
            val config = ProtocolConfig(trialsPerBlock = trials!!, practiceTrials = practice!!, speeds = speeds, grips = grips)
            startSession(participant, config)
        }
    }

    private fun startSession(participant: Participant, config: ProtocolConfig) {
        val plan = Scheduler.buildPlan(participant.id, config)
        val s = Session.create(this, plan, participant, cues.sampleRate)
        if (!s.recorder.hasRequiredSensors()) {
            s.events.close()
            AlertDialog.Builder(this).setMessage("This phone has no accelerometer or gyroscope.").show()
            return
        }
        s.recorder.start()
        s.events.log(Events.SESSION_START, note = "participant=${participant.id}")
        s.writeMeta()
        session = s
        showBlockIntro()
    }

    // ---------------------------------------------------------------- blocks

    private fun showBlockIntro() {
        val s = session ?: return showSetup()
        val b = s.plan.blocks[s.blockIndex]
        val c = b.condition
        val practice = b.trials.count { it.isPractice }
        val remainingMin = s.plan.blocks.drop(s.blockIndex).sumOf { it.durationMs } / 60000.0
        screen {
            text("Block ${b.index + 1} of ${s.plan.blocks.size} · about %.0f min left".format(Locale.US, remainingMin), 14f, color = MUTED_COLOR)
            text("${c.hand.label.uppercase(Locale.US)} hand", 34f, bold = true)
            text("Speed: ${c.speed.label}\n${c.speed.instruction}", 20f)
            text("Grip: ${c.grip.label}\n${c.grip.instruction}", 20f)
            section("Instructions")
            text(
                "Sit upright. Hold the phone in your ${c.hand.label} hand as described above.\n\n" +
                    "Start position: arm straight forward at shoulder height. Keep still.\n\n" +
                    "• HIGH beep → touch the tip of your nose with that hand (the phone stays in your hand) and stay there.\n" +
                    "• LOW beep → go back to the start position and keep still.\n\n" +
                    "${b.trials.size} trials, the first $practice are practice. Rest your arm before starting if you need to.",
                16f,
            )
            if (s.attempts[b.index] > 0) {
                text("This block was interrupted before; starting it again repeats it.", 14f, color = ERROR_COLOR)
            }
            button("Start block") { startBlock(b) }
            button("Skip this block") {
                s.events.log(Events.BLOCK_SKIPPED, b, s.attempts[b.index])
                s.skipped.add(b.index)
                nextBlock()
            }
            button("Finish session now") { onBackPressedCompat() }
        }
    }

    private fun onBackPressedCompat() {
        @Suppress("DEPRECATION")
        onBackPressed()
    }

    private fun startBlock(b: BlockPlan) {
        val s = session ?: return
        s.attempts[b.index]++
        showRunning(b)
        runner = BlockRunner(b, s.attempts[b.index], cues, s.events, this).also { it.start() }
    }

    private fun showRunning(b: BlockPlan) = screen {
        text("${b.condition.hand.label.uppercase(Locale.US)} hand · ${b.condition.speed.label} · ${b.condition.grip.label}", 16f, color = MUTED_COLOR)
        statusView = text("Get ready", 52f, bold = true).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(80), 0, dp(24))
        }
        detailView = text("", 18f).apply { gravity = Gravity.CENTER }
        button("Stop block") { runner?.cancel("stopped_by_user") }
    }

    override fun onStatus(status: String, detail: String) {
        statusView?.text = status
        detailView?.text = detail
    }

    override fun onBlockFinished(block: BlockPlan) {
        val s = session ?: return
        runner = null
        s.completed.add(block.index)
        s.skipped.remove(block.index)
        s.writeMeta()
        nextBlock()
    }

    override fun onBlockAborted(block: BlockPlan, reason: String) {
        runner = null
        session?.writeMeta()
        if (reason == "stopped_by_user" || reason == "app_paused") showBlockIntro()
    }

    private fun nextBlock() {
        val s = session ?: return
        s.blockIndex++
        if (s.blockIndex >= s.plan.blocks.size) finishSession() else showBlockIntro()
    }

    // ---------------------------------------------------------------- finish

    private fun finishSession() {
        val s = session ?: return
        if (s.finished) return
        runner = null
        s.recorder.stop()
        s.events.log(Events.SESSION_END)
        s.events.close()
        s.finished = true
        s.endedAt = Session.isoNow()
        s.writeMeta()
        screen { text("Saving…", 24f, bold = true) }
        Thread {
            val result = runCatching { Exporter.exportZip(this, s.dir) }
            runOnUiThread { showDone(s, result) }
        }.start()
    }

    private fun showDone(s: Session, result: Result<Uri>) = screen {
        text("Session finished", 26f, bold = true)
        text("Completed blocks: ${s.completed.size} of ${s.plan.blocks.size}", 16f)
        val summary = s.recorder.summary()
        @Suppress("UNCHECKED_CAST")
        val rates = summary["effective_rate_hz"] as Map<String, Double>
        @Suppress("UNCHECKED_CAST")
        val clock = summary["clock_check"] as Map<String, Any?>
        text(
            "Effective rate: acc %.1f Hz, gyro %.1f Hz".format(Locale.US, rates["acc"], rates["gyro"]) +
                "\nSame time base for sensors and cues: ${clock["same_time_base"]}",
            14f,
            color = MUTED_COLOR,
        )
        result.fold(
            onSuccess = { uri ->
                text("Saved to Download/HandToNose/${s.dir.name}.zip", 16f)
                button("Share…") {
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = "application/zip"
                        putExtra(Intent.EXTRA_STREAM, uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    startActivity(Intent.createChooser(send, "Send session data"))
                }
            },
            onFailure = { e ->
                text("Export failed: ${e.message}\nThe raw files are still in ${s.dir.absolutePath}", 14f, color = ERROR_COLOR)
            },
        )
        button("New session") {
            session = null
            showSetup()
        }
    }
}
