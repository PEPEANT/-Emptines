export async function probeExistingServer(port, serviceName) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(`http://localhost:${port}/health`, {
      method: "GET",
      signal: controller.signal,
      headers: { accept: "application/json" }
    });

    if (!response.ok) {
      return false;
    }

    const payload = await response.json().catch(() => null);
    return Boolean(payload?.ok && payload?.service === serviceName);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
