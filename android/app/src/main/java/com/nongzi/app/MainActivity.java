package com.nongzi.app;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;

/**
 * 极简 WebView 壳：
 * 1. 加载线上 H5（BuildConfig.WEB_URL，可用 -PwebUrl= 或 WEB_URL 覆盖）；
 * 2. tel: 协议交给系统拨号盘（ACTION_DIAL，不需要额外权限）；
 * 3. 硬件返回键优先回退网页历史，栈空时才退出；
 * 4. 允许明文流量（部分自建站点是 http://）。
 */
public class MainActivity extends AppCompatActivity {

    private static final String STATE_URL = "nongzi.state.url";

    private WebView webView;
    private ProgressBar progressBar;
    private LinearLayout errorView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);
        errorView = findViewById(R.id.errorView);
        Button retryButton = findViewById(R.id.retryButton);
        TextView errorText = findViewById(R.id.errorText);

        configureWebView();
        retryButton.setOnClickListener(v -> {
            errorView.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            webView.reload();
        });

        String startUrl = resolveStartUrl();
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(startUrl);
        }

        registerBackHandler();
    }

    /** 线上地址优先；未配置时退回本地 assets 兜底页面 */
    private String resolveStartUrl() {
        String url = BuildConfig.WEB_URL;
        if (url == null || url.trim().isEmpty()) {
            return "file:///android_asset/index.html";
        }
        return url.trim();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        // 允许页面内加载 http 资源（自建站点可能没有 HTTPS）
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        // H5 里点击下载链接（app-release.apk）时交给系统安装器
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl().toString());
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                errorView.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                progressBar.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                // 只处理主文档错误，第三方资源失败不打断页面
                if (request != null && request.isForMainFrame()) {
                    showError("网络连接失败，请检查网络后重试");
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setData(Uri.parse(url));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (mimetype != null && !mimetype.isEmpty()) {
                intent.setType(mimetype);
            } else {
                intent.setType("application/vnd.android.package-archive");
            }
            try {
                startActivity(intent);
            } catch (ActivityNotFoundException e) {
                Toast.makeText(MainActivity.this, R.string.download_failed, Toast.LENGTH_SHORT).show();
            }
        });
    }

    /**
     * 处理外部协议跳转。
     *
     * @return true 表示已由原生处理，WebView 不再加载该地址
     */
    private boolean handleUrl(String url) {
        if (url == null) {
            return false;
        }
        String lower = url.toLowerCase();
        if (lower.startsWith("tel:")) {
            dial(url);
            return true;
        }
        if (lower.startsWith("mailto:") || lower.startsWith("sms:")) {
            return openWithSystemApp(url, null);
        }
        if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("about:blank")) {
            return false;
        }
        // 微信 / 支付宝等第三方 scheme：交给系统尝试打开，打不开就忽略
        return openWithSystemApp(url, null);
    }

    /** 调起系统拨号盘（用户确认后才真正拨出） */
    private void dial(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_DIAL, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.dial_failed, Toast.LENGTH_SHORT).show();
        }
    }

    private boolean openWithSystemApp(String url, String type) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            if (type != null) {
                intent.setType(type);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        }
    }

    private void showError(String message) {
        TextView text = findViewById(R.id.errorText);
        if (text != null) {
            text.setText(message);
        }
        webView.setVisibility(View.GONE);
        errorView.setVisibility(View.VISIBLE);
    }

    /** 返回键：先回退网页历史，栈空时再退出应用 */
    private void registerBackHandler() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                    this::handleBack);
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            handleBack();
        } else {
            super.onBackPressed();
        }
    }

    private void handleBack() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            finish();
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_DOWN) {
            handleBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
