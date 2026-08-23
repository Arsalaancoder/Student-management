package com.edutrack.studentmanagement;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessaging;

public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    private static final String TAG = "EduTrackLauncher";
    private static final String PREFS_NAME = "EduTrackPrefs";
    private static final String KEY_FCM_TOKEN = "native_fcm_token";
    private static final int PERMISSION_REQUEST_CODE = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }

        // 1. Create Android Notification Channel
        EduTrackFirebaseMessagingService.createNotificationChannel(this);

        // 2. Request Android 13+ POST_NOTIFICATIONS runtime permission if needed
        requestNotificationPermission();

        // 3. Fetch native FCM token asynchronously
        fetchNativeFCMToken();
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                        this,
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        PERMISSION_REQUEST_CODE
                );
            }
        }
    }

    private void fetchNativeFCMToken() {
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful()) {
                    Log.w(TAG, "Fetching FCM registration token failed", task.getException());
                    return;
                }
                String token = task.getResult();
                Log.d(TAG, "Native FCM registration token: " + token);

                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                prefs.edit().putString(KEY_FCM_TOKEN, token).apply();
            });
        } catch (Exception e) {
            Log.e(TAG, "Error requesting FCM token: " + e.getMessage());
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        Uri uri = super.getLaunchingUrl();

        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String nativeToken = prefs.getString(KEY_FCM_TOKEN, null);

            if (nativeToken != null && !nativeToken.isEmpty()) {
                Uri.Builder builder = uri.buildUpon();
                builder.appendQueryParameter("native_fcm_token", nativeToken);
                return builder.build();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error appending FCM token to launching URL: " + e.getMessage());
        }

        return uri;
    }
}
