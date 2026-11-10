package io.github.mariyaz0.handtonose

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView

/* Tiny helpers to build screens in code: the app uses only the Android framework, no libraries. */

fun Activity.dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

fun Activity.screen(build: LinearLayout.() -> Unit) {
    val root = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(20), dp(24), dp(20), dp(32))
    }
    root.build()
    setContentView(ScrollView(this).apply {
        fitsSystemWindows = true
        addView(root)
    })
}

fun LinearLayout.text(s: String, sizeSp: Float = 16f, bold: Boolean = false, color: Int? = null): TextView =
    TextView(context).apply {
        text = s
        textSize = sizeSp
        if (bold) setTypeface(typeface, Typeface.BOLD)
        color?.let { setTextColor(it) }
        setPadding(0, 8, 0, 8)
    }.also { addView(it) }

fun LinearLayout.section(title: String): TextView =
    text(title, 18f, bold = true).apply { setPadding(0, 32, 0, 8) }

fun LinearLayout.button(label: String, onClick: () -> Unit): Button =
    Button(context).apply {
        text = label
        isAllCaps = false
        setOnClickListener { onClick() }
    }.also { addView(it) }

fun LinearLayout.edit(hint: String, numeric: Boolean = false, initial: String = ""): EditText =
    EditText(context).apply {
        this.hint = hint
        setText(initial)
        inputType = if (numeric) InputType.TYPE_CLASS_NUMBER else InputType.TYPE_CLASS_TEXT
        setSingleLine(true)
    }.also { addView(it) }

fun LinearLayout.check(label: String, checked: Boolean): CheckBox =
    CheckBox(context).apply {
        text = label
        isChecked = checked
    }.also { addView(it) }

/** A radio group that remembers which option index is selected. */
class Choice(val group: RadioGroup, private val ids: List<Int>) {
    val index: Int get() = ids.indexOf(group.checkedRadioButtonId)
}

fun LinearLayout.choice(options: List<String>, horizontal: Boolean = false): Choice {
    val group = RadioGroup(context).apply {
        orientation = if (horizontal) RadioGroup.HORIZONTAL else RadioGroup.VERTICAL
    }
    val ids = options.map { label ->
        val b = RadioButton(context).apply {
            id = View.generateViewId()
            text = label
        }
        group.addView(b)
        b.id
    }
    addView(group)
    return Choice(group, ids)
}

val ERROR_COLOR: Int = Color.parseColor("#d03b3b")
val MUTED_COLOR: Int = Color.parseColor("#52514e")
