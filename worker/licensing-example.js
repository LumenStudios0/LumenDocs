export const licenseClientExample = String.raw`package your.plugin.licensing;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;
import com.google.gson.Strictness;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonToken;
import java.io.IOException;
import java.io.StringReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

public final class LicenseClient {
    private final URI endpoint;
    private final HttpClient http;

    public LicenseClient(String apiBaseUrl) {
        URI base = URI.create(apiBaseUrl);
        if (!"https".equalsIgnoreCase(base.getScheme()) || base.getHost() == null
                || base.getRawUserInfo() != null || base.getQuery() != null
                || base.getFragment() != null) {
            throw new IllegalArgumentException("Licensing requires a clean HTTPS API URL");
        }
        String path = base.getPath().replaceAll("/+$", "");
        if (!path.endsWith("/v1")) path += "/v1";
        endpoint = base.resolve(path + "/validate");
        http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    public Result validate(String licenseKey, String pluginId, String productId,
                           String pluginToken, String serverId)
            throws IOException, InterruptedException {
        if (licenseKey == null || licenseKey.length() < 16 || licenseKey.length() > 128
                || pluginId == null || !pluginId.matches("[A-Za-z0-9_.-]{1,64}")
                || productId == null || !productId.matches("[A-Za-z0-9_.-]{1,64}")
                || pluginToken == null || pluginToken.isBlank()
                || pluginToken.contains("\r") || pluginToken.contains("\n")
                || (serverId != null && serverId.length() > 128)) {
            throw new IllegalArgumentException("Invalid licensing configuration");
        }
        JsonObject body = new JsonObject();
        body.addProperty("licenseKey", licenseKey);
        body.addProperty("pluginId", pluginId);
        body.addProperty("productId", productId);
        if (serverId != null && !serverId.isBlank()) body.addProperty("serverId", serverId);
        HttpRequest request = HttpRequest.newBuilder(endpoint)
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .header("X-Plugin-Token", pluginToken)
                .POST(HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> response = http.send(
                request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() != 200 || response.body().length() > 65536) {
            throw new IOException("Licensing returned an invalid HTTP response");
        }
        return parseResponse(response.body());
    }

    public static Result parseResponse(String text) throws IOException {
        try {
            JsonReader reader = new JsonReader(new StringReader(text));
            reader.setStrictness(Strictness.STRICT);
            JsonElement root = JsonParser.parseReader(reader);
            if (reader.peek() != JsonToken.END_DOCUMENT) throw new IOException("Unexpected trailing licensing JSON");
            if (!root.isJsonObject()) throw new IOException("Invalid licensing response object");
            JsonObject body = root.getAsJsonObject();
            JsonElement valid = body.get("valid");
            JsonElement code = body.get("code");
            if (valid == null || !valid.isJsonPrimitive()
                    || !valid.getAsJsonPrimitive().isBoolean()
                    || code == null || !code.isJsonPrimitive()
                    || !code.getAsJsonPrimitive().isString()
                    || !code.getAsString().matches("[a-z_]{1,64}")) {
                throw new IOException("Invalid licensing response fields");
            }
            return new Result(valid.getAsBoolean(), code.getAsString());
        } catch (JsonParseException ex) {
            throw new IOException("Malformed licensing JSON");
        }
    }

    public record Result(boolean valid, String code) {}
}`;

export const licensingLifecycleExample = String.raw`// Add these imports and fields to your existing JavaPlugin main class.
import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;
import org.bukkit.scheduler.BukkitTask;
import your.plugin.licensing.LicenseClient;

private final AtomicBoolean licenseCheckRunning = new AtomicBoolean(false);
private volatile boolean licensed = false;
private boolean licensedFeaturesStarted = false;
private BukkitTask licenseChecks;

// Call startLicenseChecks() from onEnable(), after saveDefaultConfig().
// Do not register licensed commands/listeners before startLicensedFeatures().
private void startLicenseChecks() {
    final LicenseClient client;
    final String key = getConfig().getString("licensing.license-key", "");
    final String pluginId = getConfig().getString("licensing.plugin-id", "");
    final String productId = getConfig().getString("licensing.product-id", "");
    final String token = getConfig().getString("licensing.plugin-token", "");
    final String serverId = getConfig().getString("licensing.server-id", "");
    try {
        client = new LicenseClient(getConfig().getString(
                "licensing.api-url", "https://license.lumenstudio.fyi"));
    } catch (IllegalArgumentException ex) {
        getLogger().severe("Invalid licensing API configuration; plugin disabled.");
        getServer().getPluginManager().disablePlugin(this);
        return;
    }
    licenseChecks = getServer().getScheduler().runTaskTimerAsynchronously(this, () -> {
        if (!licenseCheckRunning.compareAndSet(false, true)) return;
        try {
            LicenseClient.Result result = client.validate(key, pluginId, productId, token, serverId);
            getServer().getScheduler().runTask(this, () -> {
                if (!isEnabled()) return;
                licensed = result.valid();
                if (!licensed) {
                    getLogger().severe("License denied: " + result.code() + "; plugin disabled.");
                    getServer().getPluginManager().disablePlugin(this);
                } else if (!licensedFeaturesStarted) {
                    licensedFeaturesStarted = true;
                    startLicensedFeatures();
                }
            });
        } catch (IOException | IllegalArgumentException ex) {
            licensed = false;
            getLogger().severe("License validation failed; plugin disabled. Check configuration and service status.");
            getServer().getScheduler().runTask(this, () -> {
                if (isEnabled()) getServer().getPluginManager().disablePlugin(this);
            });
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            licensed = false;
            getLogger().warning("License validation interrupted; licensed features remain disabled.");
        } finally {
            licenseCheckRunning.set(false);
        }
    }, 1L, 6000L);
}

public boolean isLicensed() {
    return licensed && isEnabled();
}

// Call stopLicenseChecks() from your existing onDisable().
private void stopLicenseChecks() {
    licensed = false;
    if (licenseChecks != null) licenseChecks.cancel();
    // Also cancel/close your own feature tasks and resources here.
}

// Move your existing licensed feature setup here (commands, listeners, tasks).
private void startLicensedFeatures() {
    // Existing plugin-specific initialization goes here.
}

// In each licensed command/listener/task, return without changing state
// when !isLicensed(). Do not bypass this guard for operators.`;

export const licensingMavenExample = String.raw`<!-- Add Gson to <dependencies>. -->
<dependency>
  <groupId>com.google.code.gson</groupId>
  <artifactId>gson</artifactId>
  <version>2.11.0</version>
</dependency>

<!-- Merge into <build><plugins>, not a second <build> element.
     If shading already exists, add this relocation to that configuration. -->
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-shade-plugin</artifactId>
  <version>3.6.0</version>
  <executions>
    <execution>
      <phase>package</phase>
      <goals><goal>shade</goal></goals>
      <configuration>
        <createDependencyReducedPom>false</createDependencyReducedPom>
        <relocations>
          <relocation>
            <pattern>com.google.gson</pattern>
            <shadedPattern>your.plugin.internal.gson</shadedPattern>
          </relocation>
        </relocations>
      </configuration>
    </execution>
  </executions>
</plugin>`;

export const licensingConfigExample = String.raw`licensing:
  api-url: "https://license.lumenstudio.fyi"
  plugin-id: "YOUR_REGISTERED_PLUGIN_ID"
  product-id: "YOUR_LINKED_PRODUCT_ID"
  plugin-token: "YOUR_PLUGIN_SCOPED_TOKEN"
  license-key: "CUSTOMER_ENTERED_LICENSE_KEY"
  server-id: "" # Optional; configure one stable installation ID if used.`;
