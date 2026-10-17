# Forgeheart native plugins

Two actual VST3 targets: **HearthEmber**, a 12-voice synth with sine/saw/triangle/square, ADSR, detune and an overtone oscillator; **HearthPrism**, a stereo effect rack with filter, drive, bit reduction, sample hold, tremolo, echo and reverb. Both have a custom charcoal/glass rotary editor and automatable parameters, saved in the plugin's state. Saw and square use polyBLEP correction. Triangle is a simple oscillator, not a wavetable engine. Parameter changes are currently block-rate; this first version is for patch making and short samples, not fast automation performance.

Build with CMake 3.22+ and Visual Studio C++ tools on Windows:

```
cmake -S plugins/forgeheart -B build/forgeheart -A x64
cmake --build build/forgeheart --config Release --parallel 2
```

CMake fetches JUCE 8.0.13. JUCE is separately licensed (AGPLv3 or a commercial JUCE licence); see its upstream LICENSE.md before redistributing binaries. This build does not install into system plugin folders. Add the generated `*_artefacts/Release/VST3` folder in Hearth's Plugin vault, or install a bundle yourself. The branch workflow produces downloadable Windows bundles without deploying Hearth or changing main.

Hearth's browser Ember bench is an independent lightweight preview implementation; its patches and sound are not identical to the native plugins. Native preset states are saved through the VST host.
