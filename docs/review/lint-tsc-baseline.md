# Lint/TS Baseline

## Lint 目前既有錯誤摘要
- `app/admin/cost-types/page.tsx`：`no-explicit-any`、`no-unused-vars`
- `app/admin/logs/page.tsx`：`no-explicit-any`、`no-unused-vars`
- `app/admin/orgs/page.tsx`：`no-explicit-any`、`no-unused-vars`
- `app/admin/projects/page.tsx`：`no-explicit-any`、`no-unused-vars`
- `app/admin/roles/page.tsx`：`no-explicit-any`、`no-unused-vars`
- `app/admin/tasks/page.tsx`：`no-explicit-any`、`no-unused-vars`、`@next/next/no-img-element`
- `app/admin/units/page.tsx`：`no-explicit-any`、`no-unused-vars`
- `app/admin/users/page.tsx`：`no-explicit-any`、`no-unused-vars`
- `app/api/logs/route.ts`：`no-explicit-any`
- `app/dashboard/page.tsx`：`no-explicit-any`
- `app/device/register/DeviceRegisterClient.tsx`：`no-explicit-any`、`react-hooks/set-state-in-effect`、`react-hooks/exhaustive-deps`
- `app/page.tsx`：`@next/next/no-html-link-for-pages`
- `app/projects/[id]/ProjectWorkspace.tsx`：`no-explicit-any`、`react-hooks/purity`、`react-hooks/exhaustive-deps`、`@next/next/no-img-element`
- `app/projects/[id]/TaskEditorSheet.tsx`：`no-explicit-any`
- `app/projects/[id]/actions.ts`：`no-explicit-any`
- `app/projects/[id]/costs/CostRequestFormModal.tsx`：`react-hooks/set-state-in-effect`
- `app/projects/[id]/costs/CostRequestsClient.tsx`：`react-hooks/set-state-in-effect`、`no-explicit-any`
- `app/settings/page.tsx`：`no-explicit-any`
- `components/app-shell.tsx`：`no-explicit-any`、`no-unused-vars`、`@next/next/no-html-link-for-pages`
- `components/sidebar-toggle.tsx`：`react-hooks/set-state-in-effect`
- `components/theme-switcher.tsx`：`react-hooks/set-state-in-effect`
- `lib/org.ts`：`no-explicit-any`
- `lib/system-log.ts`：`no-explicit-any`
- `utils/supabase/updateSession.ts`：`prefer-const`、`no-explicit-any`

## TSC 目前既有錯誤摘要
- `app/admin/tasks/page.tsx`：`tasks` 可能為 `null`（TS18047）
- `app/admin/users/page.tsx`：參數隱式 `any`（TS7006）
- `app/dashboard/page.tsx`：`TaskRow` 缺 `seq`（TS2339）
- `app/projects/[id]/ProjectWorkspace.tsx`：大量 `nullability`（TS18047）、缺 `setSubtaskOffset`（TS2304）、Pointer event 型別不符（TS2345）、`string | null` 不相容（TS2345）
- `app/projects/[id]/costs/CostRequestDetailDrawer.tsx`：`request` 可能為 `null`（TS18047/TS2345）
- `app/settings/page.tsx`：`AssistRow` 型別轉換不相容（TS2352）
- `src/app/me/page.tsx`、`src/lib/supabase/server.ts`：`createServerSupabase` 回傳型別不一致（TS2339）

## 建議清債切分（2~3 個 PR）
1) Admin/Settings 型別與 lint（低風險，重複 `no-explicit-any` + `no-unused-vars`）：`app/admin/*`、`app/settings/page.tsx`、`lib/org.ts`、`lib/system-log.ts`
2) Projects Workspace + Costs（中風險，較多流程與互動）：`app/projects/[id]/ProjectWorkspace.tsx`、`app/projects/[id]/costs/*`、`app/projects/[id]/actions.ts`
3) 基礎架構與 UI/體驗（中風險，可能牽動 auth/route）：`src/lib/supabase/server.ts`、`src/app/me/page.tsx`、`components/*`、`app/page.tsx`、`app/device/register/DeviceRegisterClient.tsx`


pdblueray@DESKTOP-DellNB:~/projects/outsource-track$ pnpm run lint || true
pnpm exec tsc --noEmit || true

> outsource-track@0.1.0 lint /home/pdblueray/projects/outsource-track
> eslint


/home/pdblueray/projects/outsource-track/app/admin/cost-types/page.tsx
  172:12  warning  'e' is defined but never used             @typescript-eslint/no-unused-vars
  172:15  error    Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/pdblueray/projects/outsource-track/app/admin/logs/page.tsx
  82:12  warning  'e' is defined but never used             @typescript-eslint/no-unused-vars
  82:15  error    Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/pdblueray/projects/outsource-track/app/admin/orgs/page.tsx
  155:12  warning  'e' is defined but never used             @typescript-eslint/no-unused-vars
  155:15  error    Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/pdblueray/projects/outsource-track/app/admin/projects/page.tsx
  152:12  warning  'e' is defined but never used             @typescript-eslint/no-unused-vars
  152:15  error    Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/pdblueray/projects/outsource-track/app/admin/roles/page.tsx
   76:37  error    Unexpected any. Specify a different type          @typescript-eslint/no-explicit-any
  131:17  warning  'sessionData' is assigned a value but never used  @typescript-eslint/no-unused-vars
  199:12  warning  'e' is defined but never used                     @typescript-eslint/no-unused-vars
  199:15  error    Unexpected any. Specify a different type          @typescript-eslint/no-explicit-any

/home/pdblueray/projects/outsource-track/app/admin/tasks/page.tsx
   20:37  error    Unexpected any. Specify a different type                                                                                                                                                                                                                                                 @typescript-eslint/no-explicit-any
   72:33  error    Unexpected any. Specify a different type                                                                                                                                                                                                                                                 @typescript-eslint/no-explicit-any
  223:6   warning  'PageProps' is defined but never used                                                                                                                                                                                                                                                    @typescript-eslint/no-unused-vars
  283:12  warning  'e' is defined but never used                                                                                                                                                                                                                                                            @typescript-eslint/no-unused-vars
  283:15  error    Unexpected any. Specify a different type                                                                                                                                                                                                                                                 @typescript-eslint/no-explicit-any
  457:9   warning  'orgNameById' is assigned a value but never used                                                                                                                                                                                                                                         @typescript-eslint/no-unused-vars
  795:39  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element  @next/next/no-img-element

/home/pdblueray/projects/outsource-track/app/admin/units/page.tsx
  149:12  warning  'e' is defined but never used             @typescript-eslint/no-unused-vars
  149:15  error    Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/pdblueray/projects/outsource-track/app/admin/users/page.tsx
   35:39  error    Unexpected any. Specify a different type                   @typescript-eslint/no-explicit-any
   85:15  error    Unexpected any. Specify a different type                   @typescript-eslint/no-explicit-any
  162:15  error    Unexpected any. Specify a different type                   @typescript-eslint/no-explicit-any
  190:16  warning  'deleteMembershipAction' is defined but never used         @typescript-eslint/no-unused-vars
  213:15  error    Unexpected any. Specify a different type                   @typescript-eslint/no-explicit-any
  266:15  error    Unexpected any. Specify a different type                   @typescript-eslint/no-explicit-any
  331:14  warning  'e' is defined but never used                              @typescript-eslint/no-unused-vars
  331:17  error    Unexpected any. Specify a different type                   @typescript-eslint/no-explicit-any
  479:7   warning  'canDeleteMemberships' is assigned a value but never used  @typescript-eslint/no-unused-vars
  524:9   warning  'unitNameById' is assigned a value but never used          @typescript-eslint/no-unused-vars

/home/pdblueray/projects/outsource-track/app/api/logs/route.ts
  17:25  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/pdblueray/projects/outsource-track/app/dashboard/page.tsx
  78:37  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/pdblueray/projects/outsource-track/app/device/register/DeviceRegisterClient.tsx
  51:19  error    Unexpected any. Specify a different type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           @typescript-eslint/no-explicit-any
  59:10  error    Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/pdblueray/projects/outsource-track/app/device/register/DeviceRegisterClient.tsx:59:10
  57 |   useEffect(() => {
  58 |     if (!deviceId) return;
> 59 |     void registerDevice();
     |          ^^^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  60 |   }, [deviceId]);
  61 |
  62 |   return (  react-hooks/set-state-in-effect
  60:6   warning  React Hook useEffect has a missing dependency: 'registerDevice'. Either include it or remove the dependency array                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  react-hooks/exhaustive-deps

/home/pdblueray/projects/outsource-track/app/page.tsx
  12:11  error  Do not use an `<a>` element to navigate to `/projects/`. Use `<Link />` from `next/link` instead. See: https://nextjs.org/docs/messages/no-html-link-for-pages  @next/next/no-html-link-for-pages
  56:11  error  Do not use an `<a>` element to navigate to `/projects/`. Use `<Link />` from `next/link` instead. See: https://nextjs.org/docs/messages/no-html-link-for-pages  @next/next/no-html-link-for-pages

/home/pdblueray/projects/outsource-track/app/projects/[id]/ProjectWorkspace.tsx
   143:10  warning  'notesByTask' is assigned a value but never used                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      @typescript-eslint/no-unused-vars
   158:44  error    Unexpected any. Specify a different type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              @typescript-eslint/no-explicit-any
   246:6   warning  React Hook useEffect has a missing dependency: 'normalizeTask'. Either include it or remove the dependency array                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      react-hooks/exhaustive-deps
   344:9   warning  The 'startDate' conditional could make the dependencies of useMemo Hook (at line 363) change on every render. To fix this, wrap the initialization of 'startDate' in its own useMemo() Hook                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           react-hooks/exhaustive-deps
   344:9   warning  The 'startDate' conditional could make the dependencies of useMemo Hook (at line 402) change on every render. To fix this, wrap the initialization of 'startDate' in its own useMemo() Hook                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           react-hooks/exhaustive-deps
   345:9   warning  The 'today' object construction makes the dependencies of useMemo Hook (at line 402) change on every render. To fix this, wrap the initialization of 'today' in its own useMemo() Hook                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                react-hooks/exhaustive-deps
   566:16  error    Unexpected any. Specify a different type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              @typescript-eslint/no-explicit-any
   616:19  error    Unexpected any. Specify a different type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              @typescript-eslint/no-explicit-any
   629:18  error    Unexpected any. Specify a different type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              @typescript-eslint/no-explicit-any
   685:20  error    Error: Cannot call impure function during render

`Date.now` is an impure function. Calling an impure function can produce unstable results that update unpredictably when the component happens to re-render. (https://react.dev/reference/rules/components-and-hooks-must-be-pure#components-and-hooks-must-be-idempotent).

/home/pdblueray/projects/outsource-track/app/projects/[id]/ProjectWorkspace.tsx:685:20
  683 |
  684 |     const fallback: Task = {
> 685 |       id: `local-${Date.now()}`,
      |                    ^^^^^^^^^^ Cannot call impure function
  686 |       seq: localTasks.length + 1,
  687 |       phase_name: selectedTask.phase_name,
  688 |       code: null,  react-hooks/purity
   768:18  error    Unexpected any. Specify a different type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              @typescript-eslint/no-explicit-any
  1257:27  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element                                                                                                                                                                                                                                                                                                                                                                                                               @next/next/no-img-element
  1534:33  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element                                                                                                                                                                                                                                                                                                                                                                                                               @next/next/no-img-element
  1634:20  error    Unexpected any. Specify a different type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              @typescript-eslint/no-explicit-any
  1675:19  error    Unexpected any. Specify a different type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              @typescript-eslint/no-explicit-any

/home/pdblueray/projects/outsource-track/app/projects/[id]/TaskEditorSheet.tsx
  33:18  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/pdblueray/projects/outsource-track/app/projects/[id]/actions.ts
   16:20  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  164:20  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  240:20  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  322:20  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/pdblueray/projects/outsource-track/app/projects/[id]/costs/CostRequestFormModal.tsx
  74:7  error  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/pdblueray/projects/outsource-track/app/projects/[id]/costs/CostRequestFormModal.tsx:74:7
  72 |     if (!props.open) return;
  73 |     if (props.request) {
> 74 |       setDocNo(props.request.doc_no ?? "");
     |       ^^^^^^^^ Avoid calling setState() directly within an effect
  75 |       setRequestDate(props.request.request_date ?? "");
  76 |       setPayeeType(props.request.payee_type ?? "vendor");
  77 |       setPayeeName(props.request.payee_name ?? "");  react-hooks/set-state-in-effect

/home/pdblueray/projects/outsource-track/app/projects/[id]/costs/CostRequestsClient.tsx
   82:19  error  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/pdblueray/projects/outsource-track/app/projects/[id]/costs/CostRequestsClient.tsx:82:19
  80 |   const [isPending, startTransition] = useTransition();
  81 |
> 82 |   useEffect(() => setRequests(props.requests), [props.requests]);
     |                   ^^^^^^^^^^^ Avoid calling setState() directly within an effect
  83 |   useEffect(() => setItems(props.items), [props.items]);
  84 |   useEffect(() => setAttachments(props.attachments), [props.attachments]);
  85 |                     react-hooks/set-state-in-effect
   83:19  error  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/pdblueray/projects/outsource-track/app/projects/[id]/costs/CostRequestsClient.tsx:83:19
  81 |
  82 |   useEffect(() => setRequests(props.requests), [props.requests]);
> 83 |   useEffect(() => setItems(props.items), [props.items]);
     |                   ^^^^^^^^ Avoid calling setState() directly within an effect
  84 |   useEffect(() => setAttachments(props.attachments), [props.attachments]);
  85 |
  86 |   const canManage = props.role === "manager" || props.role === "admin";        react-hooks/set-state-in-effect
   84:19  error  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/pdblueray/projects/outsource-track/app/projects/[id]/costs/CostRequestsClient.tsx:84:19
  82 |   useEffect(() => setRequests(props.requests), [props.requests]);
  83 |   useEffect(() => setItems(props.items), [props.items]);
> 84 |   useEffect(() => setAttachments(props.attachments), [props.attachments]);
     |                   ^^^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  85 |
  86 |   const canManage = props.role === "manager" || props.role === "admin";
  87 |  react-hooks/set-state-in-effect
  182:95  error  Unexpected any. Specify a different type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             @typescript-eslint/no-explicit-any

/home/pdblueray/projects/outsource-track/app/settings/page.tsx
  53:37  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/pdblueray/projects/outsource-track/components/app-shell.tsx
   34:10  warning  'clientRole' is assigned a value but never used                                                                                                                 @typescript-eslint/no-unused-vars
  257:46  error    Unexpected any. Specify a different type                                                                                                                        @typescript-eslint/no-explicit-any
  314:7   error    Do not use an `<a>` element to navigate to `/`. Use `<Link />` from `next/link` instead. See: https://nextjs.org/docs/messages/no-html-link-for-pages           @next/next/no-html-link-for-pages
  318:9   error    Do not use an `<a>` element to navigate to `/projects/`. Use `<Link />` from `next/link` instead. See: https://nextjs.org/docs/messages/no-html-link-for-pages  @next/next/no-html-link-for-pages

/home/pdblueray/projects/outsource-track/components/sidebar-toggle.tsx
  13:5  error  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/pdblueray/projects/outsource-track/components/sidebar-toggle.tsx:13:5
  11 |     const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  12 |     const next = stored === "1";
> 13 |     setCollapsed(next);
     |     ^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  14 |     document.documentElement.dataset.sidebar = next ? "collapsed" : "expanded";
  15 |   }, []);
  16 |  react-hooks/set-state-in-effect

/home/pdblueray/projects/outsource-track/components/theme-switcher.tsx
  20:7  error  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/pdblueray/projects/outsource-track/components/theme-switcher.tsx:20:7
  18 |     const stored = window.localStorage.getItem("theme") as ThemeId | null;
  19 |     if (stored && THEMES.some((t) => t.id === stored)) {
> 20 |       setTheme(stored);
     |       ^^^^^^^^ Avoid calling setState() directly within an effect
  21 |     }
  22 |   }, []);
  23 |  react-hooks/set-state-in-effect

/home/pdblueray/projects/outsource-track/lib/org.ts
  1:55  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/pdblueray/projects/outsource-track/lib/system-log.ts
  16:95  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

✖ 72 problems (48 errors, 24 warnings)

 ELIFECYCLE  Command failed with exit code 1.
app/admin/tasks/page.tsx:402:9 - error TS2322: Type 'null' is not assignable to type 'PostgrestFilterBuilder<any, any, any, { id: any; project_task_id: any; name: any; web_view_link: any; thumbnail_link: any; mime_type: any; }[], "drive_items", unknown, "GET">'.

402         driveQuery = null;
            ~~~~~~~~~~

app/admin/tasks/page.tsx:684:12 - error TS18047: 'tasks' is possibly 'null'.

684           {tasks.map((t) => (
               ~~~~~

app/admin/users/page.tsx:47:25 - error TS7006: Parameter 'row' implicitly has an 'any' type.

47   (data ?? []).forEach((row) => {
                           ~~~

app/dashboard/page.tsx:72:50 - error TS2339: Property 'seq' does not exist on type 'TaskRow'.

72   const ordered = tasks.slice().sort((a, b) => a.seq - b.seq);
                                                    ~~~

app/dashboard/page.tsx:72:58 - error TS2339: Property 'seq' does not exist on type 'TaskRow'.

72   const ordered = tasks.slice().sort((a, b) => a.seq - b.seq);
                                                            ~~~

app/projects/[id]/ProjectWorkspace.tsx:476:11 - error TS18047: 'dragState' is possibly 'null'.

476       if (dragState.pointerId !== null && event.pointerId !== dragState.pointerId) {
              ~~~~~~~~~

app/projects/[id]/ProjectWorkspace.tsx:476:63 - error TS18047: 'dragState' is possibly 'null'.

476       if (dragState.pointerId !== null && event.pointerId !== dragState.pointerId) {
                                                                  ~~~~~~~~~

app/projects/[id]/ProjectWorkspace.tsx:479:39 - error TS18047: 'dragState' is possibly 'null'.

479       const deltaPx = event.clientX - dragState.startX;
                                          ~~~~~~~~~

app/projects/[id]/ProjectWorkspace.tsx:480:12 - error TS18047: 'dragState' is possibly 'null'.

480       if (!dragState.active && Math.abs(deltaPx) < dragThreshold) {
               ~~~~~~~~~

app/projects/[id]/ProjectWorkspace.tsx:483:12 - error TS18047: 'dragState' is possibly 'null'.

483       if (!dragState.active) {
               ~~~~~~~~~

app/projects/[id]/ProjectWorkspace.tsx:490:34 - error TS18047: 'dragState' is possibly 'null'.

490           : { moved: true, type: dragState.type };
                                     ~~~~~~~~~

app/projects/[id]/ProjectWorkspace.tsx:494:27 - error TS18047: 'dragState' is possibly 'null'.

494           if (task.id !== dragState.taskId) return task;
                              ~~~~~~~~~

app/projects/[id]/ProjectWorkspace.tsx:495:15 - error TS18047: 'dragState' is possibly 'null'.

495           if (dragState.type === "move") {
                  ~~~~~~~~~

app/projects/[id]/ProjectWorkspace.tsx:496:43 - error TS18047: 'dragState' is possibly 'null'.

496             const nextStart = Math.max(0, dragState.startOffset + delta);
                                              ~~~~~~~~~

app/projects/[id]/ProjectWorkspace.tsx:499:15 - error TS18047: 'dragState' is possibly 'null'.

499           if (dragState.type === "resize-left") {
                  ~~~~~~~~~

app/projects/[id]/ProjectWorkspace.tsx:500:43 - error TS18047: 'dragState' is possibly 'null'.

500             const nextStart = Math.max(0, dragState.startOffset + delta);
                                              ~~~~~~~~~

app/projects/[id]/ProjectWorkspace.tsx:501:46 - error TS18047: 'dragState' is possibly 'null'.

501             const nextDuration = Math.max(1, dragState.startDuration - delta);
                                                 ~~~~~~~~~

app/projects/[id]/ProjectWorkspace.tsx:504:44 - error TS18047: 'dragState' is possibly 'null'.

504           const nextDuration = Math.max(1, dragState.startDuration + delta);
                                               ~~~~~~~~~

app/projects/[id]/ProjectWorkspace.tsx:511:11 - error TS18047: 'dragState' is possibly 'null'.

511       if (dragState.pointerId !== null && event.pointerId !== dragState.pointerId) {
              ~~~~~~~~~

app/projects/[id]/ProjectWorkspace.tsx:511:63 - error TS18047: 'dragState' is possibly 'null'.

511       if (dragState.pointerId !== null && event.pointerId !== dragState.pointerId) {
                                                                  ~~~~~~~~~

app/projects/[id]/ProjectWorkspace.tsx:515:58 - error TS18047: 'dragState' is possibly 'null'.

515       const task = tasksRef.current.find((t) => t.id === dragState.taskId);
                                                             ~~~~~~~~~

app/projects/[id]/ProjectWorkspace.tsx:703:5 - error TS2304: Cannot find name 'setSubtaskOffset'.

703     setSubtaskOffset(selectedTask.start_offset_days);
        ~~~~~~~~~~~~~~~~

app/projects/[id]/ProjectWorkspace.tsx:1073:70 - error TS2345: Argument of type 'MouseEvent<HTMLDivElement, MouseEvent>' is not assignable to parameter of type 'PointerEvent<HTMLDivElement>'.
  Type 'MouseEvent<HTMLDivElement, MouseEvent>' is missing the following properties from type 'PointerEvent<HTMLDivElement>': pointerId, pressure, tangentialPressure, tiltX, and 6 more.

1073                         onContextMenu={(event) => openFlagMenu(task, event)}
                                                                          ~~~~~

app/projects/[id]/ProjectWorkspace.tsx:1077:84 - error TS2345: Argument of type 'PointerEvent<HTMLSpanElement>' is not assignable to parameter of type 'PointerEvent<HTMLDivElement>'.
  Property 'align' is missing in type 'HTMLSpanElement' but required in type 'HTMLDivElement'.

1077                           onPointerDown={(event) => beginDrag(task, "resize-left", event)}
                                                                                        ~~~~~

  node_modules/typescript/lib/lib.dom.d.ts:13650:5
    13650     align: string;
              ~~~~~
    'align' is declared here.

app/projects/[id]/ProjectWorkspace.tsx:1081:85 - error TS2345: Argument of type 'PointerEvent<HTMLSpanElement>' is not assignable to parameter of type 'PointerEvent<HTMLDivElement>'.
  Property 'align' is missing in type 'HTMLSpanElement' but required in type 'HTMLDivElement'.

1081                           onPointerDown={(event) => beginDrag(task, "resize-right", event)}
                                                                                         ~~~~~

  node_modules/typescript/lib/lib.dom.d.ts:13650:5
    13650     align: string;
              ~~~~~
    'align' is declared here.

app/projects/[id]/ProjectWorkspace.tsx:1211:55 - error TS2345: Argument of type 'string | null' is not assignable to parameter of type 'string'.
  Type 'null' is not assignable to type 'string'.

1211                             onClick={() => deleteFlag(flagManager.taskId, flag.id)}
                                                           ~~~~~~~~~~~~~~~~~~

app/projects/[id]/costs/CostRequestDetailDrawer.tsx:97:27 - error TS2345: Argument of type 'CostRequest | null' is not assignable to parameter of type 'CostRequest'.
  Type 'null' is not assignable to type 'CostRequest'.

97     props.onAddAttachment(request, {
                             ~~~~~~~

app/projects/[id]/costs/CostRequestDetailDrawer.tsx:134:24 - error TS18047: 'request' is possibly 'null'.

134               <div>單號：{request.doc_no}</div>
                           ~~~~~~~

app/projects/[id]/costs/CostRequestDetailDrawer.tsx:135:40 - error TS18047: 'request' is possibly 'null'.

135               <div>申請人：{props.profiles[request.requested_by] ?? request.requested_by}</div>
                                           ~~~~~~~

app/projects/[id]/costs/CostRequestDetailDrawer.tsx:135:65 - error TS18047: 'request' is possibly 'null'.

135               <div>申請人：{props.profiles[request.requested_by] ?? request.requested_by}</div>
                                                                    ~~~~~~~

app/projects/[id]/costs/CostRequestDetailDrawer.tsx:136:24 - error TS18047: 'request' is possibly 'null'.

136               <div>狀態：{request.status}</div>
                           ~~~~~~~

app/projects/[id]/costs/CostRequestDetailDrawer.tsx:137:39 - error TS18047: 'request' is possibly 'null'.

137             <div>付款日：{formatDateSlash(request.payment_date)}</div>
                                          ~~~~~~~

app/projects/[id]/costs/CostRequestDetailDrawer.tsx:138:24 - error TS18047: 'request' is possibly 'null'.

138               <div>備註：{request.note ?? "-"}</div>
                           ~~~~~~~

app/settings/page.tsx:211:20 - error TS2352: Conversion of type '{ id: any; project_id: any; project_task_id: any; unit_id: any; to_unit_id: any; status: any; due_date: any; note: any; created_at: any; updated_at: any; project_tasks: { name: any; code: any; }[]; }[]' to type 'AssistRow[]' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Type '{ id: any; project_id: any; project_task_id: any; unit_id: any; to_unit_id: any; status: any; due_date: any; note: any; created_at: any; updated_at: any; project_tasks: { name: any; code: any; }[]; }' is not comparable to type 'AssistRow'.
    Types of property 'project_tasks' are incompatible.
      Type '{ name: any; code: any; }[]' is missing the following properties from type '{ name: string; code: string | null; }': name, code

211       assistRows = (assists ?? []) as AssistRow[];
                       ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/app/me/page.tsx:5:35 - error TS2339: Property 'auth' does not exist on type 'Promise<SupabaseClient<any, "public", "public", any, any>>'.

5   const { data } = await supabase.auth.getUser();
                                    ~~~~

  src/app/me/page.tsx:5:35
    5   const { data } = await supabase.auth.getUser();
                                        ~~~~
    Did you forget to use 'await'?

src/lib/supabase/server.ts:13:30 - error TS2339: Property 'get' does not exist on type 'Promise<ReadonlyRequestCookies>'.

13           return cookieStore.get(name)?.value;
                                ~~~

  src/lib/supabase/server.ts:13:30
    13           return cookieStore.get(name)?.value;
                                    ~~~
    Did you forget to use 'await'?

src/lib/supabase/server.ts:16:23 - error TS2339: Property 'set' does not exist on type 'Promise<ReadonlyRequestCookies>'.

16           cookieStore.set({ name, value, ...options });
                         ~~~

  src/lib/supabase/server.ts:16:23
    16           cookieStore.set({ name, value, ...options });
                             ~~~
    Did you forget to use 'await'?

src/lib/supabase/server.ts:19:23 - error TS2339: Property 'set' does not exist on type 'Promise<ReadonlyRequestCookies>'.

19           cookieStore.set({ name, value: "", ...options, maxAge: 0 });
                         ~~~

  src/lib/supabase/server.ts:19:23
    19           cookieStore.set({ name, value: "", ...options, maxAge: 0 });
                             ~~~
    Did you forget to use 'await'?

utils/supabase/updateSession.ts:35:9 - error TS2769: No overload matches this call.
  Overload 2 of 2, '(supabaseUrl: string, supabaseKey: string, options: SupabaseClientOptions<"public"> & { cookieOptions?: CookieOptionsWithName | undefined; cookies: CookieMethodsServer; cookieEncoding?: "raw" | ... 1 more ... | undefined; }): SupabaseClient<...>', gave the following error.
    Object literal may only specify known properties, and 'get' does not exist in type 'CookieMethodsServer'.

35         get(name: string) {
           ~~~

  node_modules/@supabase/ssr/dist/main/createServerClient.d.ts:76:5
    76     cookies: CookieMethodsServer;
           ~~~~~~~
    The expected type comes from property 'cookies' which is declared here on type 'SupabaseClientOptions<"public"> & { cookieOptions?: CookieOptionsWithName | undefined; cookies: CookieMethodsServer; cookieEncoding?: "raw" | ... 1 more ... | undefined; }'


Found 39 errors in 9 files.

Errors  Files
     2  app/admin/tasks/page.tsx:402
     1  app/admin/users/page.tsx:47
     2  app/dashboard/page.tsx:72
    21  app/projects/[id]/ProjectWorkspace.tsx:476
     7  app/projects/[id]/costs/CostRequestDetailDrawer.tsx:97
     1  app/settings/page.tsx:211
     1  src/app/me/page.tsx:5
     3  src/lib/supabase/server.ts:13
     1  utils/supabase/updateSession.ts:35