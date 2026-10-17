cmake_minimum_required(VERSION 3.22)
project(ForgeheartInstruments VERSION 0.1.0 LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
include(FetchContent)
FetchContent_Declare(JUCE GIT_REPOSITORY https://github.com/juce-framework/JUCE.git GIT_TAG 8.0.13 GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(JUCE)
function(forge_plugin target code synth)
  juce_add_plugin(${target} COMPANY_NAME Hearth BUNDLE_ID "app.hearth.${target}"
    PLUGIN_MANUFACTURER_CODE Hrth PLUGIN_CODE ${code} FORMATS VST3
    PRODUCT_NAME "${target}" IS_SYNTH ${synth} NEEDS_MIDI_INPUT ${synth}
    COPY_PLUGIN_AFTER_BUILD FALSE)
  target_sources(${target} PRIVATE Forgeheart.cpp)
  target_compile_definitions(${target} PRIVATE JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0 FORGE_SYNTH=$<BOOL:${synth}>)
  target_link_libraries(${target} PRIVATE juce::juce_audio_utils juce::juce_dsp
    PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_warning_flags)
endfunction()
forge_plugin(HearthEmber Hemb TRUE)
forge_plugin(HearthPrism Hprm FALSE)
