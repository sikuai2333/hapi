# HAPI Mobile (React Native)

HAPI 的 Android/iOS 原生客户端，目标是替代 PWA 的临时存储行为，提供稳定的本地持久化（Hub 地址、Access Token）和手机侧会话控制能力。

## 当前功能

- 持久化保存 Hub URL 与 `CLI_API_TOKEN`
- 使用 `POST /api/auth` 换取 JWT 并自动续签
- 会话列表加载与详情查看
- 消息拉取与发送（`POST /api/sessions/:id/messages`）
- 权限请求审批/拒绝（approve/deny）

## 运行环境

- Node.js >= 20
- Android Studio（用于模拟器或真机调试）
- React Native 环境依赖（JDK、Android SDK、adb）

## 本地运行

```bash
cd mobile
npm install
npm run start
```

新开终端：

```bash
cd mobile
npm run android
```

## APK 打包（官方 RN/Gradle）

调试版 APK：

```bash
cd mobile/android
./gradlew assembleDebug
```

Windows PowerShell：

```powershell
cd mobile\android
.\gradlew.bat assembleDebug
```

产物路径：

- `mobile/android/app/build/outputs/apk/debug/app-debug.apk`

## 云打包（GitHub Actions）

仓库已新增工作流：`.github/workflows/mobile-android.yml`。

使用方式：

1. 打开仓库 `Actions` 页面，选择 `Mobile Android Build`
2. 点击 `Run workflow`
3. 选择 `build_type`：
   - `debug`：输出 `app-debug.apk`
   - `release`：输出 `app-release.apk`（当前使用模板默认签名配置）
4. 运行完成后，在该次工作流的 `Artifacts` 下载 APK

## 与 HAPI Hub 联调

1. 先在 NAS 启动 `hapi hub` 和 runner。
2. 确认手机可访问 NAS 地址（同局域网或通过 relay 提供的可访问域名）。
3. 在 App 中填写：
   - Hub 地址：例如 `http://192.168.1.20:8080`
   - CLI Access Token：`CLI_API_TOKEN`
4. 点击连接后即可看到会话并进行消息/权限操作。

## 注意

- 如果使用 `http://`，Android 需允许明文流量（模板默认通过 `usesCleartextTraffic` 占位处理）。
- `/api/auth` 返回 JWT 默认 15 分钟有效，客户端会在 401 时自动重新认证。
