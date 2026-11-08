package io.github.mariyaz0.handtonose.core

/**
 * Edinburgh Handedness Inventory - Short Form (Veale, 2014, Laterality 19:164-177).
 * Four items, five answers each scored -100..+100; the laterality quotient (LQ) is the mean.
 * Categories: LQ <= -61 left, -60..60 mixed, >= 61 right.
 */
enum class EhiAnswer(val score: Int, val label: String) {
    ALWAYS_RIGHT(100, "Always right"),
    USUALLY_RIGHT(50, "Usually right"),
    BOTH(0, "Both equally"),
    USUALLY_LEFT(-50, "Usually left"),
    ALWAYS_LEFT(-100, "Always left"),
}

object EhiShortForm {
    val items: List<String> = listOf("Writing", "Throwing", "Toothbrush", "Spoon")

    fun laterality(answers: List<EhiAnswer>): Double {
        require(answers.size == items.size) { "expected ${items.size} answers" }
        return answers.map { it.score }.average()
    }

    fun category(lq: Double): String = when {
        lq <= -61.0 -> "left"
        lq >= 61.0 -> "right"
        else -> "mixed"
    }

    /** Dominant hand for the asymmetry analysis: the sign of the LQ (0 counts as right, flagged as mixed). */
    fun dominantHand(lq: Double): Hand = if (lq < 0) Hand.LEFT else Hand.RIGHT
}
