// Hearth's first two native instruments: Ember (polyphonic synth) / Prism (effect rack).
// JUCE is fetched separately by CMake under its upstream licence; see README.md.
#include <juce_audio_utils/juce_audio_utils.h>
#include <juce_dsp/juce_dsp.h>
#include <array>

using namespace juce;
static constexpr float pi = MathConstants<float>::pi;
struct ForgeProcessor;
struct Voice {
    int note = -1; float velocity = 0, phase = 0, phase2 = 0; ADSR env;
};
struct ForgeProcessor : AudioProcessor {
    AudioProcessorValueTreeState state;
    std::array<Voice, 12> voices;
    std::array<std::vector<float>, 2> delay;
    std::array<float, 2> low {}, held {};
    int cursor = 0, holdCounter = 0; float lfo = 0;
    double rate = 44100;
    Reverb reverb;
    static AudioProcessorValueTreeState::ParameterLayout layout() {
        AudioProcessorValueTreeState::ParameterLayout p;
        auto add = [&](const char* id, const char* label, float a, float b, float value, float skew = 1.f) {
            p.add(std::make_unique<AudioParameterFloat>(ParameterID{id, 1}, label, NormalisableRange<float>(a, b, .001f, skew), value));
        };
        if (FORGE_SYNTH) {
            p.add(std::make_unique<AudioParameterChoice>(ParameterID{"wave", 1}, "Oscillator", StringArray{"Sine", "Saw", "Triangle", "Square"}, 1));
            add("attack", "Attack", .001f, 3, .02f, .4f); add("decay", "Decay", .01f, 3, .3f, .4f);
            add("sustain", "Sustain", 0, 1, .55f); add("release", "Release", .02f, 4, .7f, .4f);
            add("detune", "Detune cents", 0, 30, 7); add("overtone", "Overtone", 0, 1, .1f);
        }
        add("cutoff", "Cutoff Hz", 80, 18000, 4500, .3f); add("drive", "Heat", 0, 1, .12f);
        add("crush", "Crystal bits", 0, 1, 0); add("hold", "Time shards", 0, 1, 0);
        add("tremolo", "Pulse depth", 0, 1, .1f); add("rate", "Pulse Hz", .1f, 20, 5, .5f);
        add("echo", "Echo mix", 0, .65f, .18f); add("time", "Echo ms", 20, 900, 270, .6f);
        add("room", "Ghost room", 0, 1, .15f); add("width", "Stereo width", 0, 1, .7f);
        add("mix", "Wet mix", 0, 1, 1); add("output", "Output", 0, 1, .6f);
        return p;
    }
    ForgeProcessor() : AudioProcessor(FORGE_SYNTH ? BusesProperties().withOutput("Output", AudioChannelSet::stereo(), true) : BusesProperties().withInput("Input", AudioChannelSet::stereo(), true).withOutput("Output", AudioChannelSet::stereo(), true)), state(*this, nullptr, "Forgeheart", layout()) {}
    float get(const char* id) const { return state.getRawParameterValue(id)->load(); }
    const String getName() const override { return FORGE_SYNTH ? "HearthEmber" : "HearthPrism"; }
    bool acceptsMidi() const override { return FORGE_SYNTH; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 8; }
    int getNumPrograms() override { return 1; } int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {} const String getProgramName(int) override { return "Personal patch"; }
    void changeProgramName(int, const String&) override {}
    bool isBusesLayoutSupported(const BusesLayout& b) const override { return b.getMainOutputChannelSet() == AudioChannelSet::stereo() && (FORGE_SYNTH || b.getMainInputChannelSet() == AudioChannelSet::stereo()); }
    void prepareToPlay(double sr, int) override { rate = sr; for (auto& d : delay) d.assign(static_cast<size_t>(sr * 2), 0); for (auto& v : voices) { v.env.setSampleRate(sr); v.env.reset(); v.note = -1; } low.fill(0); held.fill(0); cursor = holdCounter = 0; lfo = 0; reverb.setSampleRate(sr); reverb.reset(); }
    void releaseResources() override {}
    static float blep(float t, float dt) { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; }
    static float osc(float t, float dt, int wave) { if (wave == 1) return 2 * t - 1 - blep(t, dt); if (wave == 2) return 1 - 4 * std::abs(t - .5f); if (wave == 3) return (t < .5f ? 1.f : -1.f) + blep(t, dt) - blep(std::fmod(t + .5f, 1.f), dt); return std::sin(t * pi * 2); }
    void midi(const MidiMessage& m) {
        if (m.isNoteOn()) { auto it = std::find_if(voices.begin(), voices.end(), [](auto& v) { return !v.env.isActive(); }); if (it == voices.end()) it = voices.begin(); it->note = m.getNoteNumber(); it->velocity = m.getFloatVelocity(); it->phase = it->phase2 = 0; it->env.reset(); it->env.noteOn(); }
        else if (m.isNoteOff()) { for (auto& v : voices) if (v.note == m.getNoteNumber()) v.env.noteOff(); }
        else if (m.isAllNotesOff() || m.isAllSoundOff()) for (auto& v : voices) v.env.reset();
    }
    void processBlock(AudioBuffer<float>& buffer, MidiBuffer& messages) override {
        ScopedNoDenormals noDenormals;
        const int count = buffer.getNumSamples(); if (buffer.getNumChannels() < 2 || delay[0].empty()) return;
        const float alpha = 1 - std::exp(-2 * pi * jmin(get("cutoff"), static_cast<float>(rate * .45)) / static_cast<float>(rate));
        const float drive = 1 + get("drive") * 8, steps = std::pow(2.f, 16 - get("crush") * 12), pulse = get("tremolo"), speed = get("rate") / static_cast<float>(rate), feedback = get("echo"), wet = get("mix"), gain = get("output");
        const int lag = jlimit(1, static_cast<int>(delay[0].size() - 1), static_cast<int>(get("time") * rate / 1000)), hold = 1 + static_cast<int>(get("hold") * 30);
        int wave = 0; float detune = 1, overtone = 0;
        if (FORGE_SYNTH) { ADSR::Parameters env { get("attack"), get("decay"), get("sustain"), get("release") }; for (auto& v : voices) v.env.setParameters(env); wave = static_cast<int>(get("wave")); detune = std::pow(2.f, get("detune") / 1200); overtone = get("overtone"); buffer.clear(); }
        auto event = messages.cbegin();
        for (int i = 0; i < count; ++i) {
            while (event != messages.cend() && (*event).samplePosition <= i) { if (FORGE_SYNTH) midi((*event).getMessage()); ++event; }
            float sound = 0;
            if (FORGE_SYNTH) for (auto& v : voices) if (v.env.isActive()) { const float dt = static_cast<float>(MidiMessage::getMidiNoteInHertz(v.note) / rate); const float env = v.env.getNextSample(); sound += (osc(v.phase, dt, wave) + osc(v.phase2, dt * detune, wave) + std::sin(v.phase * pi * 4) * overtone) * env * v.velocity * .12f; v.phase = std::fmod(v.phase + dt, 1.f); v.phase2 = std::fmod(v.phase2 + dt * detune, 1.f); }
            for (int ch = 0; ch < 2; ++ch) {
                const float dry = FORGE_SYNTH ? sound : buffer.getSample(ch, i); low[ch] += alpha * (dry - low[ch]); float value = std::tanh(low[ch] * drive);
                value = std::round(value * steps) / steps;
                if (holdCounter == 0) held[ch] = value; value = held[ch]; value *= 1 - pulse * (.5f + .5f * std::sin(lfo * pi * 2));
                const int tap = (cursor + static_cast<int>(delay[ch].size()) - lag) % static_cast<int>(delay[ch].size());
                value += delay[ch][tap] * feedback; delay[ch][cursor] = jlimit(-2.f, 2.f, value);
                buffer.setSample(ch, i, (dry * (1 - wet) + value * wet) * gain);
            }
            holdCounter = (holdCounter + 1) % hold; cursor = (cursor + 1) % static_cast<int>(delay[0].size()); lfo = std::fmod(lfo + speed, 1.f);
        }
        Reverb::Parameters room; room.roomSize = .6f; room.damping = .5f; room.wetLevel = get("room") * wet * .3f; room.dryLevel = 1; room.width = get("width"); reverb.setParameters(room);
        reverb.processStereo(buffer.getWritePointer(0), buffer.getWritePointer(1), count);
        for (int ch = 0; ch < 2; ++ch) for (int i = 0; i < count; ++i) buffer.setSample(ch, i, jlimit(-.98f, .98f, buffer.getSample(ch, i)));
        messages.clear();
    }
    void getStateInformation(MemoryBlock& dest) override { if (auto xml = state.copyState().createXml()) copyXmlToBinary(*xml, dest); }
    void setStateInformation(const void* data, int size) override { if (auto xml = getXmlFromBinary(data, size)) if (xml->hasTagName(state.state.getType())) state.replaceState(ValueTree::fromXml(*xml)); }
    bool hasEditor() const override { return true; }
    AudioProcessorEditor* createEditor() override;
};
struct ForgeLook : LookAndFeel_V4 {
    ForgeLook() { setColour(Slider::rotarySliderFillColourId, Colour(0xffff547d)); setColour(Slider::rotarySliderOutlineColourId, Colour(0xff39323f)); setColour(Slider::textBoxTextColourId, Colour(0xfff1edf4)); setColour(Slider::textBoxOutlineColourId, Colours::transparentBlack); setColour(ComboBox::backgroundColourId, Colour(0xff27222e)); setColour(ComboBox::outlineColourId, Colour(0xff64566f)); }
    void drawRotarySlider(Graphics& g, int x, int y, int w, int h, float pos, float start, float end, Slider& s) override {
        auto bounds = Rectangle<float>(static_cast<float>(x), static_cast<float>(y), static_cast<float>(w), static_cast<float>(h)).reduced(7); const float r = jmin(bounds.getWidth(), bounds.getHeight()) / 2, cx = bounds.getCentreX(), cy = bounds.getCentreY();
        g.setGradientFill(ColourGradient(Colour(0xff504553), cx - r, cy - r, Colour(0xff18151c), cx + r, cy + r, false)); g.fillEllipse(cx - r, cy - r, r * 2, r * 2);
        Path arc; arc.addCentredArc(cx, cy, r - 3, r - 3, 0, start, start + pos * (end - start), true); g.setColour(s.isMouseOverOrDragging() ? Colour(0xffffbe59) : Colour(0xffff547d)); g.strokePath(arc, PathStrokeType(3));
        const float a = start + pos * (end - start); g.drawLine(cx, cy, cx + std::sin(a) * (r - 9), cy - std::cos(a) * (r - 9), 2);
    }
};
struct ForgeEditor : AudioProcessorEditor {
    ForgeLook look;
    OwnedArray<Slider> knobs; OwnedArray<Label> labels;
    std::vector<std::unique_ptr<AudioProcessorValueTreeState::SliderAttachment>> links;
    ComboBox wave; std::unique_ptr<AudioProcessorValueTreeState::ComboBoxAttachment> waveLink;
    explicit ForgeEditor(ForgeProcessor& p) : AudioProcessorEditor(p) {
        setLookAndFeel(&look);
        if (FORGE_SYNTH) { wave.addItemList({"Sine", "Saw", "Triangle", "Square"}, 1); addAndMakeVisible(wave); waveLink = std::make_unique<AudioProcessorValueTreeState::ComboBoxAttachment>(p.state, "wave", wave); }
        for (auto* param : p.getParameters()) if (auto* fp = dynamic_cast<AudioParameterFloat*>(param)) {
            auto* k = knobs.add(new Slider()); k->setSliderStyle(Slider::RotaryHorizontalVerticalDrag); k->setTextBoxStyle(Slider::TextBoxBelow, false, 90, 20); addAndMakeVisible(k);
            auto* label = labels.add(new Label({}, fp->name)); label->setJustificationType(Justification::centred); label->setColour(Label::textColourId, Colour(0xffb8a9c4)); addAndMakeVisible(label);
            links.push_back(std::make_unique<AudioProcessorValueTreeState::SliderAttachment>(p.state, fp->paramID, *k));
        }
        setSize(800, 145 + ((knobs.size() + 5) / 6) * 130);
    }
    ~ForgeEditor() override { setLookAndFeel(nullptr); }
    void paint(Graphics& g) override { g.fillAll(Colour(0xff151218)); g.setGradientFill(ColourGradient(Colour(0xff302336), 0, 0, Colour(0xff151218), 800, 300, false)); g.fillRect(getLocalBounds()); g.setColour(Colour(0xffb78aff)); g.setFont(12); g.drawText("FORGEHEART / PERSONAL INSTRUMENTS", 24, 16, 650, 20, Justification::left); g.setColour(Colour(0xfff1edf4)); g.setFont(32); g.drawText(FORGE_SYNTH ? "EMBER   /   oscillator forge" : "PRISM   /   fragments & echoes", 24, 42, 740, 44, Justification::left); g.setColour(Colour(0xff786780)); g.setFont(12); g.drawText("Shape a little sound. Leave a little ghost.", 24, 94, 560, 22, Justification::left); }
    void resized() override { wave.setBounds(590, 94, 180, 28); for (int i = 0; i < knobs.size(); ++i) { const int x = 15 + (i % 6) * 128, y = 140 + (i / 6) * 130; labels[i]->setBounds(x, y, 128, 20); knobs[i]->setBounds(x, y + 22, 128, 106); } }
};
AudioProcessorEditor* ForgeProcessor::createEditor() { return new ForgeEditor(*this); }
AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new ForgeProcessor(); }
