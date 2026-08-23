package com.edutrack.studentmanagement;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.google.firebase.messaging.FirebaseMessaging;

public class Application extends android.app.Application {

    private static final String TAG = "EduTrackApp";
    public static final String PREFS_NAME = "EduTrackPrefs";
    public static final String KEY_FCM_TOKEN = "native_fcm_token";

    @Override
    public void onCreate() {
        super.onCreate();

        // Register Notification Channel early
        EduTrackFirebaseMessagingService.createNotificationChannel(this);

        // Fetch native FCM token immediately on application start
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (task.isSuccessful() && task.getResult() != null) {
                    String token = task.getResult();
                    Log.d(TAG, "Application initialized Native FCM Token: " + token);
                    SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                    prefs.edit().putString(KEY_FCM_TOKEN, token).apply();
                } else {
                    Log.w(TAG, "Fetching FCM token on App start failed", task.getException());
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Error initializing FCM in Application: " + e.getMessage());
        }
    }
}
