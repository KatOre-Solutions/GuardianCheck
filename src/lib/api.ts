/**
 * Safe fetch utility to handle JSON parsing errors,
 * especially when a backend might return an HTML 404 page (e.g., on Vercel).
 */
export async function safeFetch(url: string, options: RequestInit) {
  const response = await fetch(url, options);
  
  const contentType = response.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");
  
  if (isJson) {
    const data = await response.json();
    return { 
      ok: response.ok, 
      status: response.status, 
      data,
      error: response.ok ? null : (data.error || "Server error")
    };
  } else {
    // If it's not JSON, it's likely an HTML error page (404/500)
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      data: null,
      error: response.ok ? null : `Server returned non-JSON response (${response.status})`
    };
  }
}

export async function sendCustomVerificationEmail(token: string) {
  const response = await fetch("/api/auth/send-verification", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to send verification email");
  }

  return response.json();
}

export async function registerChild(token: string, childData: any, idempotencyKey?: string) {
  const result = await safeFetch("/api/children", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-idempotency-key": idempotencyKey || ""
    },
    body: JSON.stringify(childData)
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.data;
}
