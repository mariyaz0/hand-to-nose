package io.github.mariyaz0.handtonose.core

import kotlin.random.Random

/*
 * Pure-Kotlin experiment logic (no Android imports), so it can be unit-tested on
 * any JVM. The full session schedule is computed up front from a seed and saved in
 * session.json, which makes every session reproducible and auditable.
 */

enum class Hand(val label: String) { RIGHT("right"), LEFT("left") }

enum class Speed(val label: String, val instruction: String) {
    SLOW("slow", "Slowly and smoothly"),
    NATURAL("natural", "At your natural, comfortable speed"),
    FAST("fast", "As fast as you can"),
}

/** How the phone is held. Exact definitions are still to be confirmed (docs/protocol.md). */
enum class Grip(val label: String, val instruction: String) {
    VERTICAL("vertical", "Phone upright (portrait), screen facing you"),
    HORIZONTAL("horizontal", "Phone flat, screen facing up"),
}

data class Condition(val hand: Hand, val speed: Speed, val grip: Grip)

data class ProtocolConfig(
    val trialsPerBlock: Int = 10,
    val practiceTrials: Int = 2,
    val hands: List<Hand> = Hand.entries.toList(),
    val speeds: List<Speed> = Speed.entries.toList(),
    val grips: List<Grip> = Grip.entries.toList(),
    /** Random delay between "hold still" and the go cue, so the cue cannot be anticipated. */
    val foreperiodMinMs: Long = 1500,
    val foreperiodMaxMs: Long = 3000,
    /**
     * Random time from the go cue to the return cue. Long enough that even a slow movement
     * (reaction ~0.3 s + ~1.6 s movement) leaves >= 1 s of stillness at the nose.
     */
    val holdMinMs: Long = 3000,
    val holdMaxMs: Long = 4000,
    /** Fixed time after the return cue (return movement + rest with the arm extended). */
    val returnRestMs: Long = 3000,
    /** 5000 us = 200 Hz, the highest rate Android 12+ gives without a special permission. */
    val samplingPeriodUs: Int = 5000,
) {
    init {
        require(trialsPerBlock in 1..100) { "trialsPerBlock must be 1..100" }
        require(practiceTrials in 0..10) { "practiceTrials must be 0..10" }
        require(hands.isNotEmpty() && speeds.isNotEmpty() && grips.isNotEmpty()) { "every factor needs at least one level" }
        require(foreperiodMinMs in 500..foreperiodMaxMs) { "bad foreperiod range" }
        require(holdMinMs in 500..holdMaxMs) { "bad hold range" }
        require(returnRestMs >= 1000) { "returnRestMs too short" }
        require(samplingPeriodUs in 1000..100000) { "bad sampling period" }
    }
}

data class TrialPlan(
    val index: Int,
    val isPractice: Boolean,
    val foreperiodMs: Long,
    val holdMs: Long,
    val restMs: Long,
) {
    val durationMs: Long get() = foreperiodMs + holdMs + restMs
}

data class BlockPlan(val index: Int, val condition: Condition, val trials: List<TrialPlan>) {
    val durationMs: Long get() = trials.sumOf { it.durationMs }
}

data class SessionPlan(
    val participantId: String,
    val seed: Long,
    val config: ProtocolConfig,
    val blocks: List<BlockPlan>,
) {
    val totalDurationMs: Long get() = blocks.sumOf { it.durationMs }
}

object Scheduler {
    private val ID_PATTERN = Regex("^[A-Za-z0-9_-]{1,32}$")

    fun isValidParticipantId(id: String): Boolean = ID_PATTERN.matches(id)

    /** FNV-1a 64-bit hash of the participant ID: a stable seed that is easy to recompute in Python. */
    fun seedFor(participantId: String): Long {
        var h = -0x340d631b7bdddcdbL // 0xcbf29ce484222325
        for (b in participantId.toByteArray(Charsets.UTF_8)) {
            h = h xor (b.toLong() and 0xff)
            h *= 0x100000001b3L
        }
        return h
    }

    /**
     * Block order: hands alternate (R, L, R, L ... or L, R, L, R ...; the first hand is random),
     * and the order of speed x grip conditions within each hand is shuffled. Alternating hands
     * spreads both hands evenly over the session, so fatigue and learning do not load onto one hand.
     */
    fun buildPlan(
        participantId: String,
        config: ProtocolConfig = ProtocolConfig(),
        seed: Long = seedFor(participantId),
    ): SessionPlan {
        require(isValidParticipantId(participantId)) { "participant ID must be 1-32 chars of A-Z, a-z, 0-9, _ or -" }
        val rng = Random(seed)
        val perHand: Map<Hand, MutableList<Condition>> = config.hands.associateWith { hand ->
            config.speeds.flatMap { s -> config.grips.map { g -> Condition(hand, s, g) } }
                .shuffled(rng).toMutableList()
        }
        val handOrder = config.hands.shuffled(rng)
        val ordered = mutableListOf<Condition>()
        while (perHand.values.any { it.isNotEmpty() }) {
            for (hand in handOrder) {
                val queue = perHand.getValue(hand)
                if (queue.isNotEmpty()) ordered.add(queue.removeAt(0))
            }
        }
        val blocks = ordered.mapIndexed { bi, cond ->
            val n = config.practiceTrials + config.trialsPerBlock
            val trials = (0 until n).map { ti ->
                TrialPlan(
                    index = ti,
                    isPractice = ti < config.practiceTrials,
                    foreperiodMs = uniform(rng, config.foreperiodMinMs, config.foreperiodMaxMs),
                    holdMs = uniform(rng, config.holdMinMs, config.holdMaxMs),
                    restMs = config.returnRestMs,
                )
            }
            BlockPlan(bi, cond, trials)
        }
        return SessionPlan(participantId, seed, config, blocks)
    }

    private fun uniform(rng: Random, min: Long, max: Long): Long =
        if (max == min) min else min + rng.nextLong(max - min + 1)
}
