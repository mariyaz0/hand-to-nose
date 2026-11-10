package io.github.mariyaz0.handtonose.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CoreTest {

    @Test
    fun planIsDeterministicForTheSameParticipant() {
        val a = Scheduler.buildPlan("P001")
        val b = Scheduler.buildPlan("P001")
        assertEquals(a, b)
        val c = Scheduler.buildPlan("P002")
        assertTrue("different participants should get different orders", a.blocks != c.blocks)
    }

    @Test
    fun fullFactorialEveryConditionOnce() {
        val plan = Scheduler.buildPlan("P001")
        assertEquals(2 * 3 * 2, plan.blocks.size)
        assertEquals(plan.blocks.size, plan.blocks.map { it.condition }.toSet().size)
    }

    @Test
    fun handsAlternate() {
        val plan = Scheduler.buildPlan("P007")
        plan.blocks.zipWithNext().forEach { (x, y) ->
            assertTrue("consecutive blocks must use different hands", x.condition.hand != y.condition.hand)
        }
    }

    @Test
    fun firstHandIsNotAlwaysTheSame() {
        val firstHands = (1..40).map { Scheduler.buildPlan("P%03d".format(it)).blocks.first().condition.hand }.toSet()
        assertEquals(setOf(Hand.LEFT, Hand.RIGHT), firstHands)
    }

    @Test
    fun trialTimingsStayInRangeAndPracticeComesFirst() {
        val cfg = ProtocolConfig(trialsPerBlock = 8, practiceTrials = 2)
        val plan = Scheduler.buildPlan("P003", cfg)
        for (block in plan.blocks) {
            assertEquals(10, block.trials.size)
            assertTrue(block.trials.take(2).all { it.isPractice })
            assertTrue(block.trials.drop(2).none { it.isPractice })
            for (t in block.trials) {
                assertTrue(t.foreperiodMs in cfg.foreperiodMinMs..cfg.foreperiodMaxMs)
                assertTrue(t.holdMs in cfg.holdMinMs..cfg.holdMaxMs)
                assertEquals(cfg.returnRestMs, t.restMs)
            }
        }
        // The foreperiod must actually vary, otherwise the go cue becomes predictable.
        val fps = plan.blocks.flatMap { b -> b.trials.map { it.foreperiodMs } }.toSet()
        assertTrue(fps.size > 20)
    }

    @Test
    fun reducedDesignWorks() {
        val cfg = ProtocolConfig(speeds = listOf(Speed.NATURAL, Speed.FAST), grips = listOf(Grip.VERTICAL))
        val plan = Scheduler.buildPlan("P004", cfg)
        assertEquals(4, plan.blocks.size)
    }

    @Test
    fun seedMatchesReferenceFnv1a() {
        // Reference value computed independently in Python (docs/data_format.md).
        assertEquals("-5808556873153909620", Scheduler.seedFor("a").toString())
    }

    @Test
    fun participantIdValidation() {
        assertTrue(Scheduler.isValidParticipantId("P001"))
        assertTrue(Scheduler.isValidParticipantId("pilot_masha-2"))
        assertFalse(Scheduler.isValidParticipantId(""))
        assertFalse(Scheduler.isValidParticipantId("Masha Z"))
        assertFalse(Scheduler.isValidParticipantId("../x"))
    }

    @Test
    fun ehiScoring() {
        val allRight = List(4) { EhiAnswer.ALWAYS_RIGHT }
        assertEquals(100.0, EhiShortForm.laterality(allRight), 1e-9)
        assertEquals("right", EhiShortForm.category(100.0))
        val mixed = listOf(EhiAnswer.ALWAYS_RIGHT, EhiAnswer.USUALLY_RIGHT, EhiAnswer.BOTH, EhiAnswer.USUALLY_LEFT)
        assertEquals(25.0, EhiShortForm.laterality(mixed), 1e-9)
        assertEquals("mixed", EhiShortForm.category(25.0))
        assertEquals("mixed", EhiShortForm.category(60.0))
        assertEquals("right", EhiShortForm.category(62.5))
        assertEquals("left", EhiShortForm.category(-62.5))
        assertEquals(Hand.LEFT, EhiShortForm.dominantHand(-62.5))
    }

    @Test
    fun csvLinesHaveTheRightShape() {
        val sb = StringBuilder()
        assertEquals("123,1.5,-2.0,9.81", CsvFormat.imuLine(sb, 123L, 1.5f, -2.0f, 9.81f))
        val cond = Condition(Hand.LEFT, Speed.FAST, Grip.VERTICAL)
        val line = CsvFormat.eventLine(5L, Events.CUE_TO_NOSE, 3, 1, 4, false, cond, "a,b\nc")
        assertEquals("5,cue_to_nose,3,1,4,0,left,fast,vertical,a;b;c", line)
        assertEquals(CsvFormat.EVENTS_HEADER.split(",").size, line.split(",").size)
        assertEquals(CsvFormat.EVENTS_HEADER.split(",").size, CsvFormat.eventLine(1L, Events.SESSION_START).split(",").size)
    }

    @Test
    fun jsonEscapesAndNests() {
        val s = Json.write(mapOf("a" to "x\"y", "b" to listOf(1, 2), "c" to Double.NaN, "d" to listOf(mapOf("e" to true))))
        assertTrue(s.contains("\"a\": \"x\\\"y\""))
        assertTrue(s.contains("\"b\": [1, 2]"))
        assertTrue(s.contains("\"c\": null"))
        assertTrue(s.contains("\"e\": true"))
    }
}
