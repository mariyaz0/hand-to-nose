# Hand-to-nose movement tool: proposal

## Goal
Build a simple tool that measures how a person moves the hand to the nose and back,
using only a phone. With it we can compare the right and the left hand in right-handed
and left-handed people.

## Why this may be useful
Parkinson's disease usually starts on one side of the body. Before we can say that a
patient's difference between the hands is abnormal, we need to know how large this
difference is in healthy people. This tool is a first step towards measuring that.

## What the participant does
1. Sits upright and holds the phone in one hand, arm straight forward.
2. Hears a **high beep** → touches the nose with that hand and stays there.
3. Hears a **low beep** → moves the arm back to the start position.
4. This is repeated 10 times for each condition: each hand, three speeds (slow, normal,
   as fast as possible) and two ways of holding the phone. About 25-30 minutes in total.

The waiting time before each beep is random, so the person cannot predict it.

## What the phone records
The phone's motion sensors (accelerometer and gyroscope), 200 times per second.
No camera, no video, no names: each person gets a code such as P001.

## What we get from a recording
For each movement:
- **reaction time**: from the beep to the start of the movement;
- **duration** and **maximum speed**;
- **smoothness**: one smooth movement, or a movement with small corrections at the end;
- **tremor**: small shaking while the hand is still.

For each person: how different the dominant and the non-dominant hand are.

## How I plan to build it
**A phone app (Android)** that plays the beeps and records the sensors.

**A Python program** that turns a recording into these numbers, tables and plots automatically.

**Checking that the program measures correctly**: first on computer-generated movements,
  where the right answer is known; then on my own recordings, compared with slow-motion video.

## Why an app and not a web page
A web page can read the phone's sensors only 60 times per second; an Android app can
read them 200 times per second. This gives more precise timing: 5 ms instead of 17 ms
between measurements. I will check whether this really matters by comparing the same
recordings at 200 and at 60 measurements per second.

## Plan
**Week 1:** the app, the analysis program, checking on generated movements, first recording of myself.

**Week 2:** checking against video, a small pilot with 4-6 students, summary of results.

