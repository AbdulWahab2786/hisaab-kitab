package com.hisaabkitab.app;

import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "PdfExport")
public class PdfExportPlugin extends Plugin {

    @PluginMethod
    public void saveDocument(PluginCall call) {
        String rawName = call.getString("filename", "Hisaab Kitab Statement.pdf");
        String base64Data = call.getString("base64Data");
        String mimeType = call.getString("mimeType", "application/pdf");
        boolean openAfterSave = Boolean.TRUE.equals(call.getBoolean("openAfterSave", true));

        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("Missing document data.");
            return;
        }

        String safeName = rawName.replaceAll("[\\\\/:*?\"<>|]", "-").trim();
        if (safeName.isEmpty()) {
            safeName = "Hisaab Kitab Statement.pdf";
        }

        byte[] bytes;
        try {
            bytes = Base64.decode(base64Data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("Invalid base64 document payload.", e);
            return;
        }

        Uri savedUri = null;
        String savedPath = "";
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                savedUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (savedUri == null) {
                    throw new IllegalStateException("MediaStore returned null URI.");
                }
                try (OutputStream out = resolver.openOutputStream(savedUri)) {
                    if (out == null) {
                        throw new IllegalStateException("Failed to open output stream.");
                    }
                    out.write(bytes);
                    out.flush();
                }
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(savedUri, values, null, null);
                savedPath = "Downloads/" + safeName;
            } else {
                File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (downloadsDir != null && (downloadsDir.exists() || downloadsDir.mkdirs())) {
                    File outFile = uniqueFile(downloadsDir, safeName);
                    try (FileOutputStream fos = new FileOutputStream(outFile)) {
                        fos.write(bytes);
                        fos.flush();
                    }
                    MediaScannerConnection.scanFile(
                        getContext(),
                        new String[] { outFile.getAbsolutePath() },
                        new String[] { mimeType },
                        null
                    );
                    savedUri = FileProvider.getUriForFile(
                        getContext(),
                        getContext().getPackageName() + ".fileprovider",
                        outFile
                    );
                    savedPath = "Downloads/" + outFile.getName();
                } else {
                    throw new IllegalStateException("Downloads directory unavailable.");
                }
            }
        } catch (Exception e) {
            call.reject("Failed to save document to Downloads: " + e.getMessage(), e);
            return;
        }

        boolean opened = false;
        if (openAfterSave) {
            try {
                File cacheFile = new File(getContext().getCacheDir(), safeName);
                try (FileOutputStream cacheOut = new FileOutputStream(cacheFile)) {
                    cacheOut.write(bytes);
                    cacheOut.flush();
                }
                Uri shareUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    cacheFile
                );
                Intent viewIntent = new Intent(Intent.ACTION_VIEW);
                viewIntent.setDataAndType(shareUri, mimeType);
                viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(viewIntent);
                opened = true;
            } catch (ActivityNotFoundException ignored) {
                opened = false;
            } catch (Exception ignored) {
                if (savedUri != null) {
                    try {
                        Intent fallback = new Intent(Intent.ACTION_VIEW);
                        fallback.setDataAndType(savedUri, mimeType);
                        fallback.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                        getActivity().startActivity(fallback);
                        opened = true;
                    } catch (Exception ignoredAgain) {
                        opened = false;
                    }
                }
            }
        }

        JSObject result = new JSObject();
        result.put("saved", true);
        result.put("folder", "Downloads");
        result.put("path", savedPath);
        result.put("filename", safeName);
        result.put("opened", opened);
        call.resolve(result);
    }

    private File uniqueFile(File dir, String filename) {
        File candidate = new File(dir, filename);
        if (!candidate.exists()) return candidate;
        int dot = filename.lastIndexOf('.');
        String stem = dot > 0 ? filename.substring(0, dot) : filename;
        String ext = dot > 0 ? filename.substring(dot) : "";
        int index = 1;
        while (candidate.exists() && index < 100) {
            candidate = new File(dir, stem + " (" + index + ")" + ext);
            index++;
        }
        return candidate;
    }
}
