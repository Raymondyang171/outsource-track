"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeFetch } from "@/lib/api-client";

function buildDeviceLabel() {
  const ua = navigator.userAgent;
  const platform = navigator.platform || "";
  return `${platform} ${ua}`.trim();
}

export default function DeviceRegisterClient() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") || "/dashboard";
  const [status, setStatus] = useState<"loading" | "pending" | "approved" | "error">("loading");
  const [message, setMessage] = useState("");
  const deviceId = useMemo(() => {
    if (typeof window === "undefined") return "";
    const cached = window.localStorage.getItem("device_id");
    if (cached) return cached;
    const id = crypto.randomUUID();
    window.localStorage.setItem("device_id", id);
    return id;
  }, []);

  const registerDevice = async () => {
    setStatus("loading");
    setMessage("");
    try {
      const response = await safeFetch("/api/device/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: deviceId,
          device_name: buildDeviceLabel(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setStatus("error");
        setMessage(data.error || "設備註冊失敗");
        return;
      }
      if (data.approved) {
        setStatus("approved");
        router.replace(nextPath);
        return;
      }
      setStatus("pending");
    } catch (err: any) {
      setStatus("error");
      setMessage(err?.message ?? "設備註冊失敗");
    }
  };

  useEffect(() => {
    if (!deviceId) return;
    void registerDevice();
  }, [deviceId]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">設備授權</div>
          <div className="page-subtitle">此裝置需要管理員核准後才能進入系統。</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        {status === "loading" && <div className="page-subtitle">正在註冊裝置...</div>}
        {status === "pending" && (
          <>
            <div className="page-subtitle">已送出裝置申請，請等待管理員核准。</div>
            <button className="btn btn-primary" type="button" onClick={registerDevice}>
              重新檢查
            </button>
          </>
        )}
        {status === "error" && (
          <>
            <div className="page-subtitle">裝置註冊失敗：{message}</div>
            <button className="btn btn-primary" type="button" onClick={registerDevice}>
              重試
            </button>
          </>
        )}
      </div>
    </div>
  );
}
