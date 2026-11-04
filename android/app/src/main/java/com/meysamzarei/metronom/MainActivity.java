package com.meysamzarei.metronom;

import android.media.AudioManager;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Volume buttons always control media volume (the stream Web Audio
        // plays on), even before the first click sounds — otherwise they
        // adjust the ringer and the metronome level can't be set in advance.
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
    }
}
