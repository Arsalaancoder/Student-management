package com.edutrack.studentmanagement;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class EduTrackFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "EduTrackFCM";
    public static final String CHANNEL_ID = "edutrack_assignments";
    public static final String CHANNEL_NAME = "EduTrack Assignments";
    private static final String PREFS_NAME = "EduTrackPrefs";
    private static final String KEY_FCM_TOKEN = "native_fcm_token";

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        Log.d(TAG, "Refreshed FCM registration token: " + token);
        
        // Store token in SharedPreferences so LauncherActivity can pass it to TWA Web app
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_FCM_TOKEN, token).apply();
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Log.d(TAG, "FCM Message Received from: " + remoteMessage.getFrom());

        Map<String, String> data = remoteMessage.getData();
        
        String title = "New Assignment";
        String body = "A new assignment has been posted.";
        String assignmentId = null;

        // Extract parameters from notification or data payload
        if (remoteMessage.getNotification() != null) {
            if (remoteMessage.getNotification().getTitle() != null) {
                title = remoteMessage.getNotification().getTitle();
            }
            if (remoteMessage.getNotification().getBody() != null) {
                body = remoteMessage.getNotification().getBody();
            }
        }

        if (data != null && !data.isEmpty()) {
            if (data.containsKey("title") && data.get("title") != null) {
                title = data.get("title");
            }
            if (data.containsKey("body") && data.get("body") != null) {
                body = data.get("body");
            }
            if (data.containsKey("assignment_id")) {
                assignmentId = data.get("assignment_id");
            }
        }

        sendSystemNotification(title, body, assignmentId, data);
    }

    private void sendSystemNotification(String title, String body, String assignmentId, Map<String, String> data) {
        createNotificationChannel(this);

        // Target URL for deep linking into TWA
        String targetUrl = "https://student-management-swart-one.vercel.app";
        if (data != null && data.containsKey("url") && data.get("url") != null && !data.get("url").isEmpty()) {
            String urlPath = data.get("url");
            targetUrl += urlPath.startsWith("/") ? urlPath : "/" + urlPath;
        } else if (assignmentId != null && !assignmentId.isEmpty()) {
            targetUrl += "/student/assignments/" + assignmentId;
        } else {
            targetUrl += "/student/assignments";
        }

        Intent intent = new Intent(this, LauncherActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse(targetUrl));
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        int pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingIntentFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                (int) System.currentTimeMillis(),
                intent,
                pendingIntentFlags
        );

        Uri defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

        NotificationCompat.Builder notificationBuilder =
                new NotificationCompat.Builder(this, CHANNEL_ID)
                        .setSmallIcon(R.drawable.ic_notification_icon)
                        .setContentTitle(title)
                        .setContentText(body)
                        .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                        .setAutoCancel(true)
                        .setSound(defaultSoundUri)
                        .setPriority(NotificationCompat.PRIORITY_HIGH)
                        .setDefaults(NotificationCompat.DEFAULT_ALL)
                        .setContentIntent(pendingIntent);

        NotificationManagerCompat notificationManager = NotificationManagerCompat.from(this);
        
        int notificationId = (int) (System.currentTimeMillis() & 0xfffffff);
        try {
            notificationManager.notify(notificationId, notificationBuilder.build());
            Log.d(TAG, "Successfully posted system notification ID " + notificationId + " to tray.");
        } catch (SecurityException e) {
            Log.e(TAG, "Notification permission missing: " + e.getMessage());
        }
    }

    public static void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Notifications for new assignments and academic updates");
            channel.enableLights(true);
            channel.enableVibration(true);
            channel.setShowBadge(true);

            NotificationManager notificationManager = context.getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
                Log.d(TAG, "Registered NotificationChannel: " + CHANNEL_ID);
            }
        }
    }
}
