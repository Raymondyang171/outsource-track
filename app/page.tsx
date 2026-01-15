export default function Home() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Outsource Track</div>
          <div className="page-subtitle">
            清楚、通透的協作儀表板，聚焦專案節奏與跨單位回報。
          </div>
        </div>
        <div className="topbar-right">
          <a className="btn btn-primary" href="/projects">
            開始管理專案
          </a>
          <a className="btn btn-ghost" href="/login">
            登入
          </a>
        </div>
      </div>

      <div className="card-grid">
        <div className="card">
          <div className="card-header">
            <div className="card-title">當週重點</div>
            <span className="badge">即時更新</span>
          </div>
          <div className="page-subtitle">
            追蹤正在進行的任務與風險，保持跨部門同步。
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title">多視圖工作台</div>
            <span className="badge">看板 / 時間軸</span>
          </div>
          <div className="page-subtitle">
            從看板到時間軸，快速切換視角，保持節奏一致。
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title">右側細節面板</div>
            <span className="badge">不打斷主畫面</span>
          </div>
          <div className="page-subtitle">
            任務細節永遠在側邊，主畫面保持專注與穩定。
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">快速入口</div>
        </div>
        <div className="card-grid">
          <a className="btn btn-soft" href="/projects">
            專案總覽
          </a>
          <a className="btn btn-ghost" href="/admin/projects">
            專案管理
          </a>
          <a className="btn btn-ghost" href="/admin/tasks">
            任務管理
          </a>
          <a className="btn btn-ghost" href="/admin/memberships">
            成員與權限
          </a>
        </div>
      </div>
    </div>
  );
}
