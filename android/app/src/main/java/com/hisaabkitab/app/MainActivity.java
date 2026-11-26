package com.hisaabkitab.app;

import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String ACTION_ADD_JOB = "com.hisaabkitab.app.ACTION_ADD_JOB";
    private static final String ACTION_PENDING_PAYMENTS = "com.hisaabkitab.app.ACTION_PENDING_PAYMENTS";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.parseColor("#FFFFFF"));
        window.setNavigationBarColor(Color.parseColor("#FFFFFF"));

        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller != null) {
            controller.setAppearanceLightStatusBars(true);
            controller.setAppearanceLightNavigationBars(true);
        }

        View content = findViewById(android.R.id.content);
        if (content != null) {
            content.setBackgroundColor(Color.parseColor("#FFFFFF"));
            ViewCompat.setOnApplyWindowInsetsListener(content, (v, windowInsets) -> {
                Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
                Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return WindowInsetsCompat.CONSUMED;
            });
        }

        dispatchShortcutIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        dispatchShortcutIntent(intent);
    }

    private void dispatchShortcutIntent(Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String shortcut = null;
        if (ACTION_ADD_JOB.equals(intent.getAction())) {
            shortcut = "add-job";
        } else if (ACTION_PENDING_PAYMENTS.equals(intent.getAction())) {
            shortcut = "pending";
        }
        if (shortcut != null && getBridge() != null && getBridge().getWebView() != null) {
            final String target = shortcut;
            getBridge().getWebView().post(() -> {
                String js = "window.__hkPendingShortcut='" + target + "';window.dispatchEvent(new CustomEvent('hk:shortcut',{detail:'" + target + "'}));";
                getBridge().getWebView().evaluateJavascript(js, null);
            });
        }
    }
}
