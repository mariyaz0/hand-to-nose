package io.github.mariyaz0.handtonose.core

/*
 * File formats shared with the Python analysis (see docs/data_format.md).
 * Numbers are written with toString(), never String.format(): format() follows the
 * phone's locale and would write "9,81" on a phone set to, e.g., Russian.
 */

const val SCHEMA_VERSION = 1

object CsvFormat {
    const val IMU_HEADER = "t_ns,x,y,z"
    const val EVENTS_HEADER = "t_ns,event,block_index,attempt,trial_index,is_practice,hand,speed,grip,note"

    fun imuLine(sb: StringBuilder, tNs: Long, x: Float, y: Float, z: Float): String {
        sb.setLength(0)
        sb.append(tNs).append(',').append(x).append(',').append(y).append(',').append(z)
        return sb.toString()
    }

    fun eventLine(
        tNs: Long,
        event: String,
        blockIndex: Int? = null,
        attempt: Int? = null,
        trialIndex: Int? = null,
        isPractice: Boolean? = null,
        condition: Condition? = null,
        note: String = "",
    ): String = listOf(
        tNs.toString(),
        event,
        blockIndex?.toString() ?: "",
        attempt?.toString() ?: "",
        trialIndex?.toString() ?: "",
        isPractice?.let { if (it) "1" else "0" } ?: "",
        condition?.hand?.label ?: "",
        condition?.speed?.label ?: "",
        condition?.grip?.label ?: "",
        sanitize(note),
    ).joinToString(",")

    /** Notes must not break the CSV: commas, quotes and line breaks are replaced. */
    fun sanitize(s: String): String = s.replace(Regex("[,\"\\r\\n]"), ";")
}

object Events {
    const val SESSION_START = "session_start"
    const val BLOCK_START = "block_start"
    const val TRIAL_START = "trial_start"
    const val CUE_TO_NOSE = "cue_to_nose"
    const val CUE_FROM_NOSE = "cue_from_nose"
    const val TRIAL_END = "trial_end"
    const val BLOCK_END = "block_end"
    const val BLOCK_ABORTED = "block_aborted"
    const val BLOCK_SKIPPED = "block_skipped"
    const val SENSOR_ACCURACY = "sensor_accuracy"
    const val ERROR = "error"
    const val SESSION_END = "session_end"
}

/** Minimal JSON writer (the app has no third-party dependencies on purpose). */
object Json {
    fun write(value: Any?): String = StringBuilder().also { append(it, value, 0) }.toString()

    private fun append(sb: StringBuilder, v: Any?, indent: Int) {
        when (v) {
            null -> sb.append("null")
            is String -> quote(sb, v)
            is Boolean -> sb.append(v)
            is Double -> if (v.isNaN() || v.isInfinite()) sb.append("null") else sb.append(v)
            is Float -> if (v.isNaN() || v.isInfinite()) sb.append("null") else sb.append(v)
            is Number -> sb.append(v)
            is Enum<*> -> quote(sb, v.name)
            is Map<*, *> -> {
                if (v.isEmpty()) { sb.append("{}"); return }
                sb.append("{\n")
                v.entries.forEachIndexed { i, (k, value) ->
                    pad(sb, indent + 1); quote(sb, k.toString()); sb.append(": ")
                    append(sb, value, indent + 1)
                    if (i < v.size - 1) sb.append(',')
                    sb.append('\n')
                }
                pad(sb, indent); sb.append('}')
            }
            is Iterable<*> -> {
                val items = v.toList()
                if (items.isEmpty()) { sb.append("[]"); return }
                val simple = items.all { it == null || it is Number || it is Boolean || it is String }
                if (simple) {
                    sb.append('[')
                    items.forEachIndexed { i, x -> if (i > 0) sb.append(", "); append(sb, x, indent) }
                    sb.append(']')
                } else {
                    sb.append("[\n")
                    items.forEachIndexed { i, x ->
                        pad(sb, indent + 1); append(sb, x, indent + 1)
                        if (i < items.size - 1) sb.append(',')
                        sb.append('\n')
                    }
                    pad(sb, indent); sb.append(']')
                }
            }
            else -> quote(sb, v.toString())
        }
    }

    private fun pad(sb: StringBuilder, n: Int) { repeat(n) { sb.append("  ") } }

    private fun quote(sb: StringBuilder, s: String) {
        sb.append('"')
        for (c in s) {
            when (c) {
                '"' -> sb.append("\\\"")
                '\\' -> sb.append("\\\\")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                else -> if (c < ' ') sb.append("\\u%04x".format(c.code)) else sb.append(c)
            }
        }
        sb.append('"')
    }
}

/** Everything the analysis needs to know about the plan, as plain maps/lists for session.json. */
fun SessionPlan.toJsonMap(): Map<String, Any?> = linkedMapOf(
    "seed" to seed.toString(), // as a string: JSON readers may lose precision on 64-bit ints
    "config" to linkedMapOf(
        "trials_per_block" to config.trialsPerBlock,
        "practice_trials" to config.practiceTrials,
        "hands" to config.hands.map { it.label },
        "speeds" to config.speeds.map { it.label },
        "grips" to config.grips.map { it.label },
        "foreperiod_ms" to listOf(config.foreperiodMinMs, config.foreperiodMaxMs),
        "hold_ms" to listOf(config.holdMinMs, config.holdMaxMs),
        "return_rest_ms" to config.returnRestMs,
        "sampling_period_us" to config.samplingPeriodUs,
    ),
    "blocks" to blocks.map { b ->
        linkedMapOf(
            "block_index" to b.index,
            "hand" to b.condition.hand.label,
            "speed" to b.condition.speed.label,
            "grip" to b.condition.grip.label,
            "trials" to b.trials.map { t ->
                linkedMapOf(
                    "trial_index" to t.index,
                    "is_practice" to t.isPractice,
                    "foreperiod_ms" to t.foreperiodMs,
                    "hold_ms" to t.holdMs,
                    "rest_ms" to t.restMs,
                )
            },
        )
    },
)
