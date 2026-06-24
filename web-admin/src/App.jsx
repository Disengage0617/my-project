import { useEffect, useMemo, useState } from "react";
import { call, getRuntimeConfig, updateRuntimeConfig } from "./api.js";

const STORE_ID = "store_demo_001";

const navGroups = [
  {
    title: "经营",
    items: [
      { id: "dashboard", label: "经营看板", action: "getAdminDashboard" },
      { id: "reservations", label: "预约看板", action: "getAdminReservations" },
      { id: "customers", label: "客户信息", action: "getCustomers" }
    ]
  },
  {
    title: "配置",
    items: [
      { id: "store", label: "门店配置", action: "getStoreDetail" },
      { id: "tables", label: "桌台配置", action: "manageTables" },
      { id: "assistants", label: "助教配置", action: "getAssistants" },
      { id: "campaigns", label: "活动配置", action: "getCampaigns" }
    ]
  },
  {
    title: "增长",
    items: [
      { id: "registrations", label: "报名名单", action: "getCampaignRegistrations" },
      { id: "noShows", label: "爽约限制", action: "getNoShowRecords" },
      { id: "assets", label: "素材库", action: "getAssets" },
      { id: "decorator", label: "首页装修器", action: "getPageConfig" },
      { id: "audit", label: "操作记录", action: "getAuditLogs" }
    ]
  }
];

const statusText = {
  idle: "空闲",
  reserved: "已预约",
  in_use: "使用中",
  cleaning: "清洁中",
  repairing: "维修中",
  disabled: "停用",
  pending_arrival: "待到店",
  pending_verify: "待核实",
  in_service: "进行中",
  completed: "已完成",
  active: "限制中",
  published: "已上架",
  draft: "草稿",
  pending_review: "待审核",
  resting: "休息中"
};

const tableTypes = ["普台", "乔氏银腿", "独牙", "乔氏金腿", "乔氏玫瑰金"];
const assetTypeText = {
  hero: "首页头图",
  campaign: "活动图片",
  assistant: "助教图片",
  other: "其他图片"
};

function money(cent = 0) {
  return `${Math.round(Number(cent || 0) / 100)} 元`;
}

function statusLabel(value) {
  return statusText[value] || value || "未知";
}

function assetTypeLabel(value) {
  return assetTypeText[value] || value || "未分类";
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function byId(list, id) {
  return list.find((item) => item.id === id) || list[0];
}

export default function App() {
  const [activeId, setActiveId] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [runtime, setRuntime] = useState(() => getRuntimeConfig());
  const [data, setData] = useState({
    dashboard: null,
    store: null,
    tables: [],
    assistants: [],
    campaigns: [],
    reservations: [],
    customers: [],
    registrations: [],
    noShows: [],
    assets: [],
    pageConfig: null,
    auditLogs: []
  });

  const active = useMemo(() => navGroups.flatMap((group) => group.items).find((item) => item.id === activeId), [activeId]);

  useEffect(() => {
    refreshAll();
  }, []);

  async function refreshAll(nextMessage = "") {
    setLoading(true);
    try {
      const [
        dashboard,
        store,
        tables,
        assistants,
        campaigns,
        reservations,
        customers,
        registrations,
        noShows,
        assets,
        pageConfig,
        auditLogs
      ] = await Promise.all([
        call("getAdminDashboard", { storeId: STORE_ID }),
        call("getStoreDetail", { storeId: STORE_ID }),
        call("manageTables", { storeId: STORE_ID, action: "list" }),
        call("getAssistants", { storeId: STORE_ID }),
        call("getCampaigns", { storeId: STORE_ID }),
        call("getAdminReservations", { storeId: STORE_ID }),
        call("getCustomers", { storeId: STORE_ID }),
        call("getCampaignRegistrations", { storeId: STORE_ID }),
        call("getNoShowRecords", { storeId: STORE_ID }),
        call("getAssets", { storeId: STORE_ID }),
        call("getPageConfig", { storeId: STORE_ID, pageKey: "home" }),
        call("getAuditLogs", { storeId: STORE_ID })
      ]);
      setData({
        dashboard,
        store,
        tables: tables.items || [],
        assistants: assistants.items || assistants.list || [],
        campaigns: campaigns.items || campaigns.list || [],
        reservations: reservations.items || [],
        customers: customers.items || [],
        registrations: registrations.items || [],
        noShows: noShows.items || [],
        assets: assets.items || [],
        pageConfig: pageConfig.config,
        auditLogs: auditLogs.items || []
      });
      setMessage(nextMessage);
    } catch (error) {
      setMessage(error.message || "后台数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function mutate(action, payload, successText) {
    setLoading(true);
    try {
      await call(action, { storeId: STORE_ID, ...payload });
      await refreshAll(successText);
    } catch (error) {
      setMessage(error.message || "操作失败");
      setLoading(false);
    }
  }

  function saveRuntime(patch) {
    const next = updateRuntimeConfig(patch);
    setRuntime(next);
    setMessage("本地运行配置已更新，真实云函数接入时替换 api.js 调用层。");
  }

  return (
    <div className="admin-shell">
      <Sidebar activeId={activeId} setActiveId={setActiveId} />
      <main className="main">
        <Topbar active={active} runtime={runtime} onRuntime={saveRuntime} loading={loading} />
        {message ? <div className="notice">{message}</div> : null}
        <section className="content">
          {activeId === "dashboard" && <Dashboard data={data} setActiveId={setActiveId} />}
          {activeId === "store" && <StorePanel store={data.store} mutate={mutate} />}
          {activeId === "tables" && <TablesPanel tables={data.tables} mutate={mutate} />}
          {activeId === "assistants" && <AssistantsPanel assistants={data.assistants} mutate={mutate} />}
          {activeId === "campaigns" && <CampaignsPanel campaigns={data.campaigns} mutate={mutate} />}
          {activeId === "reservations" && <ReservationsPanel reservations={data.reservations} />}
          {activeId === "customers" && <CustomersPanel customers={data.customers} />}
          {activeId === "registrations" && <RegistrationsPanel registrations={data.registrations} campaigns={data.campaigns} />}
          {activeId === "noShows" && <NoShowsPanel records={data.noShows} />}
          {activeId === "audit" && <AuditPanel logs={data.auditLogs} />}
          {activeId === "assets" && <AssetsPanel assets={data.assets} mutate={mutate} />}
          {activeId === "decorator" && <DecoratorPanel config={data.pageConfig} assets={data.assets} mutate={mutate} />}
        </section>
      </main>
    </div>
  );
}

function Sidebar({ activeId, setActiveId }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">W</span>
        <div>
          <strong>台球商家后台</strong>
          <small>Dark Neon Admin</small>
        </div>
      </div>
      <nav>
        {navGroups.map((group) => (
          <div className="nav-group" key={group.title}>
            <p>{group.title}</p>
            {group.items.map((item) => (
              <button className={activeId === item.id ? "active" : ""} key={item.id} onClick={() => setActiveId(item.id)}>
                <span>{item.label}</span>
                <em>{item.action}</em>
              </button>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function Topbar({ active, runtime, onRuntime, loading }) {
  return (
    <header className="topbar">
      <div>
        <span className="crumb">商家后台 / {active?.label}</span>
        <h1>{active?.label}</h1>
      </div>
      <div className="runtime">
        <label>
          云环境
          <input value={runtime.envId} placeholder="mock 模式" onChange={(event) => onRuntime({ envId: event.target.value })} />
        </label>
        <label>
          操作人
          <input value={runtime.operator} onChange={(event) => onRuntime({ operator: event.target.value })} />
        </label>
        <span className={loading ? "sync syncing" : "sync"}>{loading ? "同步中" : runtime.mode}</span>
      </div>
    </header>
  );
}

function Dashboard({ data, setActiveId }) {
  const metrics = data.dashboard?.metrics || {};
  const overview = data.dashboard?.overview || {};
  const enabledAssistants = data.assistants.filter((item) => item.enabled !== false);
  const onClockStatuses = ["in_service", "working", "busy", "on_clock", "serving"];
  const fallbackOnClockCount = enabledAssistants.filter((item) => onClockStatuses.includes(item.status)).length;
  const assistantOnClockCount = metrics.assistant_on_clock_count ?? fallbackOnClockCount;
  const assistantNotOnClockCount = metrics.assistant_not_on_clock_count ?? Math.max(enabledAssistants.length - fallbackOnClockCount, 0);
  const remainingAssistantCount = metrics.free_assistant_count ?? overview.freeAssistantCount ?? enabledAssistants.filter((item) => item.status === "idle").length;
  const cards = [
    ["今日预约", metrics.reservation_count || 0, "待到店与员工核实"],
    ["当前空桌", metrics.free_table_count || overview.freeTableCount || 0, "可被用户预约"],
    ["新增客户", metrics.customer_count || 0, "客户信息池"],
    ["活动报名", metrics.campaign_registration_count || 0, "含待审核"]
  ];
  return (
    <div className="screen">
      <div className="hero-card">
        <div>
          <span className="pill">经营概览</span>
          <h2>{overview.store?.name || "台球俱乐部"} 管理中枢</h2>
          <p>把桌台、价格、活动、客户和小程序装修放在一个工作台里，后续只替换 api.js 即可接云函数。</p>
        </div>
        <button onClick={() => setActiveId("decorator")}>进入装修器</button>
      </div>
      <div className="metric-grid">
        {cards.map(([label, value, hint]) => (
          <div className="metric-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{hint}</small>
          </div>
        ))}
      </div>
      <div className="two-col">
        <Panel title="待处理" action="去预约看板" onAction={() => setActiveId("reservations")}>
          <KpiLine label="待核实预约" value={metrics.waiting_review_count || 0} tone="warning" />
          <KpiLine label="活动待审核" value={data.registrations.filter((item) => item.status === "pending_review").length} tone="info" />
          <KpiLine label="爽约限制中" value={metrics.no_show_active_count || 0} tone="danger" />
        </Panel>
        <Panel title="助教状态" action="去配置" onAction={() => setActiveId("assistants")}>
          <KpiLine label="剩余助教数量" value={`${remainingAssistantCount} 个`} tone="success" />
          <KpiLine label="已上钟" value={`${assistantOnClockCount} 个`} tone="info" />
          <KpiLine label="未上钟" value={`${assistantNotOnClockCount} 个`} tone="warning" />
        </Panel>
      </div>
    </div>
  );
}

function StorePanel({ store, mutate }) {
  const [form, setForm] = useState(() => store || {});
  useEffect(() => setForm(store || {}), [store]);
  return (
    <ConfigScreen title="门店基础资料" desc="配置预约规则、营业信息和联系信息。">
      <div className="form-grid">
        <Field label="门店名称" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <Field label="电话" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
        <Field label="营业时间" value={form.business_hours} onChange={(business_hours) => setForm({ ...form, business_hours })} />
        <Field label="预约提前分钟" type="number" value={form.reservation_lead_minutes} onChange={(reservation_lead_minutes) => setForm({ ...form, reservation_lead_minutes: Number(reservation_lead_minutes) })} />
        <label className="span-2">
          地址
          <textarea value={form.address || ""} onChange={(event) => setForm({ ...form, address: event.target.value })} />
        </label>
      </div>
      <button className="primary" onClick={() => mutate("manageStore", { action: "update", payload: form }, "门店配置已保存")}>保存门店配置</button>
    </ConfigScreen>
  );
}

function TablesPanel({ tables, mutate }) {
  const emptyTable = () => ({
    _id: "",
    table_no: `N${tables.length + 1}`,
    table_type_name: "普台",
    area_name: "普台区",
    status: "idle",
    enabled: true,
    price_yuan: 38
  });
  const [editingTable, setEditingTable] = useState(null);
  const tableTypes = Array.from(new Set(["普台", "乔氏银腿", "独牙", ...tables.map((table) => table.table_type_name).filter(Boolean)]));
  const areas = Array.from(new Set(["普台区", "银腿区", "独牙区", ...tables.map((table) => table.area_name).filter(Boolean)]));

  function editTable(table) {
    setEditingTable({
      ...table,
      price_yuan: Math.round((table.price_cent || 0) / 100)
    });
  }

  async function saveTable() {
    if (!editingTable) return;
    const tableId = editingTable._id || `table_${Date.now()}`;
    await mutate("manageTables", {
      action: "upsert",
      tableId,
      payload: {
        ...editingTable,
        _id: tableId,
        price_cent: Number(editingTable.price_yuan || 0) * 100,
        enabled: editingTable.enabled !== false
      }
    }, editingTable._id ? "桌台配置已保存" : "已新增桌台");
    setEditingTable(null);
  }

  return (
    <ConfigScreen title="桌台配置" desc="对齐后端 action: manageTables。">
      <div className="toolbar">
        <button className="primary" onClick={() => setEditingTable(emptyTable())}>新增桌台</button>
      </div>
      {editingTable ? (
        <div className="table-editor">
          <div className="table-editor-head">
            <h3>{editingTable._id ? "编辑桌台" : "新增桌台"}</h3>
            <button className="secondary" onClick={() => setEditingTable(null)}>取消</button>
          </div>
          <div className="form-grid">
            <Field label="桌台编号" value={editingTable.table_no} onChange={(table_no) => setEditingTable({ ...editingTable, table_no })} />
            <label>
              桌子类型
              <select value={editingTable.table_type_name || "普台"} onChange={(event) => setEditingTable({ ...editingTable, table_type_name: event.target.value })}>
                {tableTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <Field label="价格（元/小时）" type="number" value={editingTable.price_yuan} onChange={(price_yuan) => setEditingTable({ ...editingTable, price_yuan })} />
            <label>
              所属区域
              <select value={editingTable.area_name || "普台区"} onChange={(event) => setEditingTable({ ...editingTable, area_name: event.target.value })}>
                {areas.map((area) => <option key={area} value={area}>{area}</option>)}
              </select>
            </label>
          </div>
          <button className="primary" onClick={saveTable}>保存桌台</button>
        </div>
      ) : null}
      <div className="table-grid">
        {tables.map((table) => (
          <div className="table-card" key={table._id}>
            <b>{table.table_no}</b>
            <span className={`badge ${table.status}`}>{statusLabel(table.status)}</span>
            <p>{table.area_name} · {table.table_type_name}</p>
            <small>{money(table.price_cent)}/小时 · {table.enabled ? "启用" : "停用"}</small>
            <div className="table-card-actions">
              <button className="secondary" onClick={() => editTable(table)}>编辑</button>
            </div>
          </div>
        ))}
      </div>
    </ConfigScreen>
  );
}

function AssistantsPanel({ assistants, mutate }) {
  const emptyAssistant = () => ({
    _id: "",
    name: `助教 ${assistants.length + 1}`,
    intro: "新增助教资料。",
    avatar_url: "/assets/generated/assistant-thumb.jpg",
    service_price_yuan: 88,
    status: "idle",
    enabled: true,
    tags: ["陪练"]
  });
  const [editingAssistant, setEditingAssistant] = useState(null);

  function editAssistant(assistant) {
    setEditingAssistant({
      ...assistant,
      service_price_yuan: Math.round((assistant.service_price_cent || 0) / 100)
    });
  }

  async function saveAssistant() {
    if (!editingAssistant) return;
    const assistantId = editingAssistant._id || `assistant_${Date.now()}`;
    await mutate("manageAssistants", {
      action: "upsert",
      assistantId,
      payload: {
        ...editingAssistant,
        _id: assistantId,
        avatar_url: editingAssistant.avatar_url,
        photo_url: editingAssistant.avatar_url,
        thumb_url: editingAssistant.avatar_url,
        service_price_cent: Number(editingAssistant.service_price_yuan || 0) * 100,
        enabled: editingAssistant.enabled !== false
      }
    }, editingAssistant._id ? "助教资料已保存" : "助教已新增");
    setEditingAssistant(null);
  }

  return (
    <ConfigScreen title="助教配置" desc="资料、标签、状态与服务价格。">
      <div className="toolbar">
        <button className="primary" onClick={() => setEditingAssistant(emptyAssistant())}>新增助教</button>
      </div>
      {editingAssistant ? (
        <div className="assistant-editor">
          <div className="table-editor-head">
            <h3>{editingAssistant._id ? "编辑助教" : "新增助教"}</h3>
            <button className="secondary" onClick={() => setEditingAssistant(null)}>取消</button>
          </div>
          <div className="assistant-editor-layout">
            <div className="assistant-photo-preview">
              <img src={editingAssistant.avatar_url || "/assets/generated/assistant-thumb.jpg"} alt={editingAssistant.name || "助教照片"} />
            </div>
            <div className="form-grid">
              <Field label="照片地址" value={editingAssistant.avatar_url} onChange={(avatar_url) => setEditingAssistant({ ...editingAssistant, avatar_url })} />
              <Field label="名字" value={editingAssistant.name} onChange={(name) => setEditingAssistant({ ...editingAssistant, name })} />
              <Field label="价格（元/小时）" type="number" value={editingAssistant.service_price_yuan} onChange={(service_price_yuan) => setEditingAssistant({ ...editingAssistant, service_price_yuan })} />
              <label>
                状态
                <select value={editingAssistant.status || "idle"} onChange={(event) => setEditingAssistant({ ...editingAssistant, status: event.target.value })}>
                  <option value="idle">空闲</option>
                  <option value="resting">休息中</option>
                  <option value="busy">已上钟</option>
                </select>
              </label>
              <label className="span-2">
                介绍
                <textarea value={editingAssistant.intro || ""} onChange={(event) => setEditingAssistant({ ...editingAssistant, intro: event.target.value })} />
              </label>
            </div>
          </div>
          <button className="primary" onClick={saveAssistant}>保存助教</button>
        </div>
      ) : null}
      <div className="card-list">
        {assistants.map((item) => (
          <article className="resource-card" key={item._id}>
            <div className="assistant-card-main">
              <img className="assistant-thumb" src={item.avatar_url || "/assets/generated/assistant-thumb.jpg"} alt={item.name} />
              <div>
                <span className={`badge ${item.status}`}>{statusLabel(item.status)}</span>
                <h3>{item.name}</h3>
                <p>{item.intro || item.tags?.join("、") || "未配置介绍"}</p>
              </div>
            </div>
            <div className="resource-actions">
              <strong>{money(item.service_price_cent)}/小时</strong>
              <button className="secondary" onClick={() => editAssistant(item)}>编辑</button>
            </div>
          </article>
        ))}
      </div>
    </ConfigScreen>
  );
}

function CampaignsPanel({ campaigns, mutate }) {
  return (
    <ConfigScreen title="活动配置" desc="新人活动、赛事活动、会员练习夜。">
      <button className="primary" onClick={() => mutate("manageCampaigns", { action: "publish", payload: { title: "新增活动", campaign_type: "match", quota_limited: true, quota_total: 16, quota_used: 0, need_review: true, status: "published", content: "活动说明", rules: "报名后到店确认。" } }, "活动已发布")}>发布活动</button>
      <div className="card-list">
        {campaigns.map((item) => (
          <article className="resource-card" key={item._id}>
            <div>
              <span className={`badge ${item.status}`}>{statusLabel(item.status)}</span>
              <h3>{item.title}</h3>
              <p>{item.content}</p>
            </div>
            <strong>{item.quota_used || 0}/{item.quota_total || "不限"}</strong>
          </article>
        ))}
      </div>
    </ConfigScreen>
  );
}

function ReservationsPanel({ reservations }) {
  return (
    <ListScreen title="预约看板" desc="员工核实、开台、关台的 Web 后台视图。">
      <DataTable
        columns={["预约", "用户", "桌台", "时段", "状态"]}
        rows={reservations.map((item) => [item._id, `${item.nickname} ${item.phone}`, `${item.tableCode} · ${item.tableType}`, `${formatTime(item.start_time)} - ${formatTime(item.end_time)}`, statusLabel(item.status)])}
      />
    </ListScreen>
  );
}

function CustomersPanel({ customers }) {
  return (
    <ListScreen title="客户信息" desc="基础客户画像，后续按角色控制手机号导出。">
      <DataTable
        columns={["客户", "手机号", "预约", "活动", "爽约", "最近到店"]}
        rows={customers.map((item) => [item.nickname, item.phone, item.reservation_count, item.campaign_count, item.no_show_count, item.last_arrival_at])}
      />
    </ListScreen>
  );
}

function RegistrationsPanel({ registrations, campaigns }) {
  return (
    <ListScreen title="活动报名名单" desc="限额活动和赛事报名审核池。">
      <DataTable
        columns={["报名", "活动", "用户", "人数", "状态", "时间"]}
        rows={registrations.map((item) => [item._id, campaigns.find((campaign) => campaign._id === item.campaign_id)?.title || item.campaign_id, `${item.nickname} ${item.phone}`, item.participant_count, statusLabel(item.status), formatTime(item.created_at)])}
      />
    </ListScreen>
  );
}

function NoShowsPanel({ records }) {
  return (
    <ListScreen title="爽约限制" desc="限制记录只读展示，解除仍按后端权限。">
      <DataTable
        columns={["记录", "用户", "原因", "状态", "限制到"]}
        rows={records.map((item) => [item._id, `${item.nickname} ${item.phone}`, item.reason, statusLabel(item.status), formatTime(item.locked_until)])}
      />
    </ListScreen>
  );
}

function AuditPanel({ logs }) {
  return (
    <ListScreen title="操作记录" desc="所有配置写入统一沉淀审计。">
      <DataTable
        columns={["操作", "对象", "角色", "时间"]}
        rows={logs.map((item) => [item.action, `${item.target_type}/${item.target_id}`, item.operator_role, formatTime(item.created_at)])}
      />
    </ListScreen>
  );
}

function AssetsPanel({ assets, mutate }) {
  const [assetForm, setAssetForm] = useState(null);
  const emptyAsset = () => ({
    name: `素材 ${assets.length + 1}`,
    type: "campaign",
    url: "/assets/generated/billiards-bg-option-2.png"
  });

  async function saveAsset() {
    if (!assetForm) return;
    await mutate("manageAssets", { action: "upsert", payload: assetForm }, "素材已新增");
    setAssetForm(null);
  }

  return (
    <ConfigScreen title="素材库" desc="商家可添加或删除图片，作为首页装修和活动配置的自有素材库。">
      <div className="toolbar">
        <button className="primary" onClick={() => setAssetForm(emptyAsset())}>添加图片</button>
      </div>
      {assetForm ? (
        <div className="asset-editor">
          <div className="table-editor-head">
            <h3>添加图片素材</h3>
            <button className="secondary" onClick={() => setAssetForm(null)}>取消</button>
          </div>
          <div className="asset-editor-layout">
            <img src={assetForm.url || "/assets/generated/billiards-bg-option-2.png"} alt={assetForm.name || "素材预览"} />
            <div className="form-grid">
              <Field label="素材名称" value={assetForm.name} onChange={(name) => setAssetForm({ ...assetForm, name })} />
              <label>
                素材分类
                <select value={assetForm.type} onChange={(event) => setAssetForm({ ...assetForm, type: event.target.value })}>
                  <option value="hero">首页头图</option>
                  <option value="campaign">活动图片</option>
                  <option value="assistant">助教图片</option>
                  <option value="other">其他图片</option>
                </select>
              </label>
              <label className="span-2">
                图片地址
                <input value={assetForm.url || ""} onChange={(event) => setAssetForm({ ...assetForm, url: event.target.value })} />
              </label>
            </div>
          </div>
          <button className="primary" onClick={saveAsset}>保存图片</button>
        </div>
      ) : null}
      <div className="asset-grid">
        {assets.map((item) => (
          <div className="asset-card" key={item._id}>
            <div className="asset-preview">
              <img src={item.url} alt={item.name} />
            </div>
            <b>{item.name}</b>
            <small>{assetTypeLabel(item.type)}</small>
            <span>{item.url}</span>
            <div className="asset-card-actions">
              <button className="secondary danger-action" onClick={() => mutate("manageAssets", { action: "delete", assetId: item._id }, "素材已删除")}>删除</button>
            </div>
          </div>
        ))}
      </div>
    </ConfigScreen>
  );
}

function DecoratorPanel({ config, assets, mutate }) {
  const modules = [...(config?.modules || [])].sort((a, b) => a.sort_order - b.sort_order);
  const [editingModule, setEditingModule] = useState(null);
  const [draggingModuleId, setDraggingModuleId] = useState("");

  function saveModules(nextModules, successText = "装修草稿已保存") {
    const normalizedModules = nextModules.map((module, index) => ({ ...module, sort_order: index + 1 }));
    mutate("managePageConfig", { action: "saveDraft", payload: { modules: normalizedModules } }, successText);
  }

  function toggleModule(module) {
    const nextModules = modules.map((item) => item.id === module.id ? { ...item, enabled: !item.enabled } : item);
    saveModules(nextModules);
  }

  function reorderModules(targetModuleId) {
    if (!draggingModuleId || draggingModuleId === targetModuleId) return;
    const fromIndex = modules.findIndex((module) => module.id === draggingModuleId);
    const toIndex = modules.findIndex((module) => module.id === targetModuleId);
    if (fromIndex < 0 || toIndex < 0) return;
    const nextModules = [...modules];
    const [movedModule] = nextModules.splice(fromIndex, 1);
    nextModules.splice(toIndex, 0, movedModule);
    setDraggingModuleId("");
    saveModules(nextModules, "模块顺序已保存");
  }

  function saveEditingModule() {
    if (!editingModule) return;
    const nextModules = modules.map((module) => module.id === editingModule.id ? editingModule : module);
    saveModules(nextModules, "模块内容已保存");
    setEditingModule(null);
  }

  return (
    <div className="decorator-layout">
      <ConfigScreen title="小程序首页装修器" desc="模块启停、排序和素材绑定，action 对齐 managePageConfig。">
        <div className="module-list">
          {modules.map((module) => (
            <article
              className={module.enabled ? "module enabled" : "module"}
              draggable
              key={module.id}
              onDragStart={() => setDraggingModuleId(module.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => reorderModules(module.id)}
            >
              <span>{module.sort_order}</span>
              <img src={module.image_url || "/assets/generated/billiards-bg-option-1.png"} alt={module.title} />
              <div>
                <b>{module.title}</b>
                <small>{module.type} · {module.subtitle}</small>
              </div>
              <div className="module-actions">
                <button className="secondary" onClick={() => setEditingModule(module)}>编辑</button>
                <button className="secondary" onClick={() => toggleModule(module)}>{module.enabled ? "隐藏" : "显示"}</button>
              </div>
            </article>
          ))}
        </div>
        {editingModule ? (
          <div className="module-editor">
            <div className="table-editor-head">
              <h3>编辑模块</h3>
              <button className="secondary" onClick={() => setEditingModule(null)}>取消</button>
            </div>
            <div className="module-editor-layout">
              <img src={editingModule.image_url || "/assets/generated/billiards-bg-option-1.png"} alt={editingModule.title || "模块图片"} />
              <div className="form-grid">
                <Field label="模块标题" value={editingModule.title} onChange={(title) => setEditingModule({ ...editingModule, title })} />
                <Field label="副标题" value={editingModule.subtitle} onChange={(subtitle) => setEditingModule({ ...editingModule, subtitle })} />
                <Field label="图片地址" value={editingModule.image_url} onChange={(image_url) => setEditingModule({ ...editingModule, image_url })} />
                <label>
                  选择素材
                  <select value={editingModule.image_url || ""} onChange={(event) => setEditingModule({ ...editingModule, image_url: event.target.value })}>
                    <option value="">手动填写图片地址</option>
                    {assets.map((asset) => <option key={asset._id} value={asset.url}>{asset.name}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <button className="primary" onClick={saveEditingModule}>保存模块</button>
          </div>
        ) : null}
        <button className="primary" onClick={() => mutate("managePageConfig", { action: "publish", payload: { modules } }, "首页装修已发布")}>发布首页配置</button>
      </ConfigScreen>
      <div className="phone-preview">
        <div className="phone-top">小程序首页预览</div>
        {modules.filter((module) => module.enabled).map((module) => (
          <div className="mini-module" key={module.id}>
            <img src={module.image_url || "/assets/generated/billiards-bg-option-1.png"} alt={module.title} />
            <span>{module.tag || module.type}</span>
            <b>{module.title}</b>
            <p>{module.subtitle}</p>
          </div>
        ))}
        <div className="asset-hint">{assets.length} 个素材可绑定</div>
      </div>
    </div>
  );
}

function ConfigScreen({ title, desc, children }) {
  return (
    <div className="screen">
      <PageIntro title={title} desc={desc} />
      <div className="panel">{children}</div>
    </div>
  );
}

function ListScreen({ title, desc, children }) {
  return (
    <div className="screen">
      <PageIntro title={title} desc={desc} />
      {children}
    </div>
  );
}

function PageIntro({ title, desc }) {
  return (
    <div className="page-intro">
      <span className="pill">Action aligned</span>
      <h2>{title}</h2>
      <p>{desc}</p>
    </div>
  );
}

function Panel({ title, action, onAction, children }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
        {action ? <button onClick={onAction}>{action}</button> : null}
      </div>
      {children}
    </div>
  );
}

function KpiLine({ label, value, tone }) {
  return (
    <div className="kpi-line">
      <span>{label}</span>
      <b className={tone}>{value}</b>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label>
      {label}
      <input type={type} value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function DataTable({ columns, rows }) {
  return (
    <div className="data-table">
      <div className="thead" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr))` }}>
        {columns.map((column) => <b key={column}>{column}</b>)}
      </div>
      {rows.map((row, index) => (
        <div className="tr" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr))` }} key={`${row[0]}-${index}`}>
          {row.map((cell, cellIndex) => <span key={`${cell}-${cellIndex}`}>{cell}</span>)}
        </div>
      ))}
      {!rows.length ? <div className="empty">暂无数据</div> : null}
    </div>
  );
}
