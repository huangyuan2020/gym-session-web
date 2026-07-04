(() => {
  const STORE = {
    template: "gym-session-template-v1",
    current: "gym-session-current-v1",
    history: "gym-session-history-v1",
  };

  const DEFAULT_TEMPLATE = {
    name: "全身力量 A",
    updatedAt: new Date().toISOString(),
    exercises: [
      { id: "tpl_squat", name: "杠铃深蹲", sets: 4, reps: 8, weight: 60, restSec: 90 },
      { id: "tpl_bench", name: "杠铃卧推", sets: 4, reps: 8, weight: 50, restSec: 90 },
      { id: "tpl_rdl", name: "罗马尼亚硬拉", sets: 3, reps: 10, weight: 55, restSec: 90 },
      { id: "tpl_row", name: "坐姿划船", sets: 3, reps: 10, weight: 45, restSec: 75 },
      { id: "tpl_lat", name: "高位下拉", sets: 3, reps: 10, weight: 45, restSec: 75 },
      { id: "tpl_press", name: "哑铃肩推", sets: 3, reps: 10, weight: 16, restSec: 75 },
      { id: "tpl_pushdown", name: "绳索下压", sets: 3, reps: 12, weight: 25, restSec: 60 },
      { id: "tpl_core", name: "卷腹", sets: 3, reps: 15, weight: 0, restSec: 45 },
    ],
  };

  const $ = (id) => document.getElementById(id);

  const icons = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 15h10l1-15"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  };

  const state = {
    template: null,
    session: null,
    history: [],
    editor: { mode: "add", exerciseId: null },
    lastRecord: null,
    reopenQueueAfterEdit: false,
  };

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Local storage can be unavailable in private browsing.
    }
  }

  function removeJson(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // No-op.
    }
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function cleanNumber(value, fallback = 0, integer = false) {
    const next = Number(value);
    if (!Number.isFinite(next)) return fallback;
    return integer ? Math.max(0, Math.round(next)) : Math.max(0, Math.round(next * 10) / 10);
  }

  function cleanText(value) {
    return String(value || "").trim();
  }

  function isDumbbellExercise(exercise) {
    return /哑铃|dumbbell|db/i.test(exercise?.name || "");
  }

  function currentStepFor(field, exercise = getCurrentExercise()) {
    if (field === "reps") return 1;
    if (field === "restSec") return 15;
    if (field === "weight") return isDumbbellExercise(exercise) ? 1 : 5;
    return 1;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function isoNow() {
    return new Date().toISOString();
  }

  function secondsBetween(startIso, endIso = isoNow()) {
    if (!startIso) return 0;
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
    return Math.max(0, Math.round((end - start) / 1000));
  }

  function formatClock(totalSeconds) {
    const seconds = Math.max(0, Math.round(totalSeconds || 0));
    const minutes = Math.floor(seconds / 60);
    const remain = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
  }

  function formatDateTime(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  function createSessionFromTemplate(template) {
    const plan = template.exercises.map((exercise) => ({
      id: uid("ex"),
      sourceId: exercise.id,
      name: exercise.name,
      sets: cleanNumber(exercise.sets, 1, true) || 1,
      reps: cleanNumber(exercise.reps, 0, true),
      weight: cleanNumber(exercise.weight, 0),
      restSec: cleanNumber(exercise.restSec, 60, true),
    }));

    return {
      id: uid("session"),
      templateName: template.name,
      createdAt: isoNow(),
      startedAt: null,
      finishedAt: null,
      status: "planned",
      phase: "ready",
      currentExerciseId: plan[0]?.id || null,
      currentDraft: null,
      workStartedAt: null,
      restStartedAt: null,
      restTargetSec: 0,
      lastSetLogId: null,
      plan,
      sets: [],
    };
  }

  function saveSession() {
    saveJson(STORE.current, state.session);
  }

  function saveTemplate() {
    saveJson(STORE.template, state.template);
  }

  function saveHistory() {
    saveJson(STORE.history, state.history.slice(0, 100));
  }

  function completedCount(exerciseId) {
    return state.session.sets.filter((set) => set.exerciseId === exerciseId).length;
  }

  function getCurrentExercise() {
    const id = state.session.currentExerciseId;
    return state.session.plan.find((exercise) => exercise.id === id) || null;
  }

  function findNextIncomplete(afterExerciseId = null) {
    const plan = state.session.plan;
    if (!plan.length) return null;

    const startIndex = Math.max(0, plan.findIndex((exercise) => exercise.id === afterExerciseId));
    const ordered = [...plan.slice(startIndex), ...plan.slice(0, startIndex)];
    return ordered.find((exercise) => completedCount(exercise.id) < cleanNumber(exercise.sets, 0, true)) || null;
  }

  function findNextAfterCurrent() {
    const plan = state.session.plan;
    if (!plan.length) return null;

    const current = getCurrentExercise();
    if (current && completedCount(current.id) < cleanNumber(current.sets, 0, true)) {
      return current;
    }

    const currentIndex = current ? plan.findIndex((exercise) => exercise.id === current.id) : -1;
    const after = currentIndex >= 0 ? plan.slice(currentIndex + 1) : plan;
    const before = currentIndex >= 0 ? plan.slice(0, currentIndex + 1) : [];
    return [...after, ...before].find((exercise) => completedCount(exercise.id) < cleanNumber(exercise.sets, 0, true)) || null;
  }

  function totalPlannedSets() {
    return state.session.plan.reduce((sum, exercise) => {
      const planned = cleanNumber(exercise.sets, 0, true);
      return sum + Math.max(planned, completedCount(exercise.id));
    }, 0);
  }

  function totalVolume(sets = state.session.sets) {
    return sets.reduce((sum, set) => sum + cleanNumber(set.actualReps, 0, true) * cleanNumber(set.actualWeight, 0), 0);
  }

  function hydrateDraft(force = false) {
    const exercise = getCurrentExercise();
    if (!exercise) {
      state.session.currentDraft = null;
      return;
    }

    if (force || !state.session.currentDraft || state.session.currentDraft.exerciseId !== exercise.id) {
      state.session.currentDraft = {
        exerciseId: exercise.id,
        reps: cleanNumber(exercise.reps, 0, true),
        weight: cleanNumber(exercise.weight, 0),
        restSec: cleanNumber(exercise.restSec, 60, true),
      };
    }
  }

  function ensurePointer() {
    const session = state.session;
    if (session.status === "finished") {
      session.currentExerciseId = null;
      session.currentDraft = null;
      session.phase = "done";
      return;
    }

    if (!session.plan.length) {
      session.currentExerciseId = null;
      session.currentDraft = null;
      if (session.phase !== "work" && session.phase !== "rest") session.phase = "ready";
      return;
    }

    if (session.phase === "work" || session.phase === "rest") {
      hydrateDraft(false);
      return;
    }

    const current = getCurrentExercise();
    if (!current || completedCount(current.id) >= cleanNumber(current.sets, 0, true)) {
      const next = findNextIncomplete(current?.id || null);
      session.currentExerciseId = next?.id || null;
      session.phase = next ? "ready" : "done";
      hydrateDraft(true);
      return;
    }

    hydrateDraft(false);
  }

  function startSet() {
    ensurePointer();
    const exercise = getCurrentExercise();
    if (!exercise) {
      openExerciseEditor("add");
      return;
    }

    hydrateDraft(false);
    const now = isoNow();
    if (!state.session.startedAt) state.session.startedAt = now;
    state.session.status = "active";
    state.session.phase = "work";
    state.session.workStartedAt = now;
    state.session.restStartedAt = null;
    state.session.restTargetSec = 0;
    state.session.lastSetLogId = null;
    saveSession();
    renderAll();
  }

  function completeSetToRest(skipRender = false) {
    const exercise = getCurrentExercise();
    if (!exercise) return;

    hydrateDraft(false);
    const draft = state.session.currentDraft || {};
    const now = isoNow();
    const startedAt = state.session.workStartedAt || now;
    const restTargetSec = cleanNumber(draft.restSec ?? exercise.restSec, 0, true);
    const setNumber = completedCount(exercise.id) + 1;

    exercise.reps = cleanNumber(draft.reps, exercise.reps, true);
    exercise.weight = cleanNumber(draft.weight, exercise.weight);
    exercise.restSec = restTargetSec;

    const log = {
      id: uid("set"),
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      exerciseOrder: state.session.plan.findIndex((item) => item.id === exercise.id) + 1,
      setNumber,
      targetReps: cleanNumber(exercise.reps, 0, true),
      targetWeight: cleanNumber(exercise.weight, 0),
      actualReps: cleanNumber(draft.reps, exercise.reps, true),
      actualWeight: cleanNumber(draft.weight, exercise.weight),
      workStartedAt: startedAt,
      workEndedAt: now,
      workDurationSec: secondsBetween(startedAt, now),
      restStartedAt: now,
      restEndedAt: null,
      restTargetSec,
      restDurationSec: null,
    };

    state.session.sets.push(log);
    state.session.phase = "rest";
    state.session.workStartedAt = null;
    state.session.restStartedAt = now;
    state.session.restTargetSec = restTargetSec;
    state.session.lastSetLogId = log.id;
    saveSession();
    if (!skipRender) renderAll();
  }

  function finishRest(now = isoNow()) {
    const log = state.session.sets.find((set) => set.id === state.session.lastSetLogId);
    if (log && !log.restEndedAt) {
      log.restEndedAt = now;
      log.restDurationSec = secondsBetween(log.restStartedAt, now);
    }
    state.session.restStartedAt = null;
    state.session.restTargetSec = 0;
    state.session.lastSetLogId = null;
  }

  function beginNextSet() {
    if (state.session.phase === "rest") finishRest();

    const next = findNextAfterCurrent();
    if (next) {
      state.session.currentExerciseId = next.id;
      state.session.phase = "ready";
      hydrateDraft(true);
    } else {
      state.session.currentExerciseId = null;
      state.session.currentDraft = null;
      state.session.phase = "done";
    }

    saveSession();
    renderAll();
  }

  function setActiveExercise(exerciseId) {
    const exists = state.session.plan.some((exercise) => exercise.id === exerciseId);
    if (!exists) return;

    if (state.session.phase === "rest") {
      finishRest();
      state.session.phase = "ready";
    } else if (state.session.phase === "done") {
      state.session.phase = "ready";
    }

    state.session.currentExerciseId = exerciseId;
    hydrateDraft(true);
    saveSession();
    closePanels();
    renderAll();
    $("currentName").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function finishWorkout() {
    if (state.session.phase === "work") completeSetToRest(true);
    if (state.session.phase === "rest") finishRest();

    const now = isoNow();
    if (!state.session.startedAt) state.session.startedAt = state.session.createdAt;
    state.session.finishedAt = now;
    state.session.status = "finished";
    state.session.phase = "done";
    state.session.currentExerciseId = null;
    state.session.currentDraft = null;

    const record = buildRecord(state.session);
    state.lastRecord = record;
    state.history = [record, ...state.history.filter((item) => item.id !== record.id)].slice(0, 100);
    saveHistory();
    removeJson(STORE.current);
    renderAll();
    renderRecord(record);
    openPanel("record");
  }

  function buildRecord(session) {
    const finishedAt = session.finishedAt || isoNow();
    const setLogs = session.sets.map((set) => ({ ...set }));
    const planSnapshot = session.plan.map((exercise, index) => ({
      order: index + 1,
      id: exercise.id,
      sourceId: exercise.sourceId,
      name: exercise.name,
      plannedSets: cleanNumber(exercise.sets, 0, true),
      targetReps: cleanNumber(exercise.reps, 0, true),
      targetWeight: cleanNumber(exercise.weight, 0),
      restSec: cleanNumber(exercise.restSec, 0, true),
    }));

    const exercises = planSnapshot.map((exercise) => {
      const sets = setLogs.filter((set) => set.exerciseId === exercise.id);
      return {
        ...exercise,
        completedSets: sets.length,
        volumeKg: Math.round(totalVolume(sets) * 10) / 10,
        sets,
      };
    });

    const loggedExerciseIds = new Set(planSnapshot.map((exercise) => exercise.id));
    setLogs
      .filter((set) => !loggedExerciseIds.has(set.exerciseId))
      .forEach((set) => {
        exercises.push({
          order: exercises.length + 1,
          id: set.exerciseId,
          sourceId: null,
          name: set.exerciseName,
          plannedSets: 0,
          targetReps: set.targetReps,
          targetWeight: set.targetWeight,
          restSec: set.restTargetSec,
          completedSets: 1,
          volumeKg: cleanNumber(set.actualReps, 0, true) * cleanNumber(set.actualWeight, 0),
          sets: [set],
        });
      });

    return {
      id: session.id,
      title: session.templateName || "力量训练",
      startedAt: session.startedAt,
      finishedAt,
      totalDurationSec: secondsBetween(session.startedAt, finishedAt),
      totalSets: setLogs.length,
      totalVolumeKg: Math.round(totalVolume(setLogs) * 10) / 10,
      planSnapshot,
      exercises,
      sets: setLogs,
    };
  }

  function moveExercise(exerciseId, direction) {
    const index = state.session.plan.findIndex((exercise) => exercise.id === exerciseId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= state.session.plan.length) return;
    const [item] = state.session.plan.splice(index, 1);
    state.session.plan.splice(nextIndex, 0, item);
    saveSession();
    renderAll();
  }

  function deleteExercise(exerciseId) {
    const exercise = state.session.plan.find((item) => item.id === exerciseId);
    if (!exercise) return;

    if (completedCount(exerciseId) > 0 && !window.confirm(`删除 ${exercise.name}？已完成的组仍会保留在本次记录里。`)) {
      return;
    }

    state.session.plan = state.session.plan.filter((item) => item.id !== exerciseId);
    if (state.session.currentExerciseId === exerciseId) {
      state.session.currentExerciseId = findNextIncomplete(exerciseId)?.id || state.session.plan[0]?.id || null;
      state.session.phase = state.session.currentExerciseId ? "ready" : "done";
      hydrateDraft(true);
    }
    ensurePointer();
    saveSession();
    renderAll();
  }

  function incrementPlannedSet(exerciseId) {
    const exercise = state.session.plan.find((item) => item.id === exerciseId);
    if (!exercise) return;
    exercise.sets = cleanNumber(exercise.sets, 1, true) + 1;
    saveSession();
    renderAll();
  }

  function openExerciseEditor(mode, exerciseId = null) {
    state.editor = { mode, exerciseId };
    state.reopenQueueAfterEdit = $("queueSection")?.classList.contains("sheet-open") || false;
    closePanels();
    const exercise = state.session.plan.find((item) => item.id === exerciseId);
    $("exerciseFormTitle").textContent = mode === "edit" ? "编辑动作" : "添加动作";
    $("exerciseNameInput").value = exercise?.name || "";
    $("exerciseSetsInput").value = exercise?.sets ?? 3;
    $("exerciseRepsInput").value = exercise?.reps ?? 10;
    $("exerciseWeightInput").value = exercise?.weight ?? 0;
    $("exerciseRestInput").value = exercise?.restSec ?? 60;
    $("exerciseSheet").classList.remove("hidden");
    $("exerciseSheet").setAttribute("aria-hidden", "false");
    setTimeout(() => $("exerciseNameInput").focus(), 60);
  }

  function closeExerciseEditor() {
    const shouldReopenQueue = state.reopenQueueAfterEdit;
    $("exerciseSheet").classList.add("hidden");
    $("exerciseSheet").setAttribute("aria-hidden", "true");
    state.reopenQueueAfterEdit = false;
    if (shouldReopenQueue) openPanel("queue");
  }

  function saveExerciseFromForm(event) {
    event.preventDefault();
    const name = cleanText($("exerciseNameInput").value);
    if (!name) return;

    const exercise = {
      name,
      sets: Math.max(1, cleanNumber($("exerciseSetsInput").value, 1, true)),
      reps: cleanNumber($("exerciseRepsInput").value, 0, true),
      weight: cleanNumber($("exerciseWeightInput").value, 0),
      restSec: cleanNumber($("exerciseRestInput").value, 60, true),
    };

    if (state.editor.mode === "edit") {
      const target = state.session.plan.find((item) => item.id === state.editor.exerciseId);
      if (target) {
        Object.assign(target, exercise);
        if (state.session.currentExerciseId === target.id) hydrateDraft(true);
      }
    } else {
      const next = { ...exercise, id: uid("ex"), sourceId: null };
      const currentIndex = state.session.plan.findIndex((item) => item.id === state.session.currentExerciseId);
      state.session.plan.splice(currentIndex >= 0 ? currentIndex + 1 : state.session.plan.length, 0, next);
      if (!state.session.currentExerciseId || state.session.phase === "done") {
        state.session.currentExerciseId = next.id;
        state.session.phase = "ready";
      }
      hydrateDraft(true);
    }

    ensurePointer();
    saveSession();
    const shouldReopenQueue = state.reopenQueueAfterEdit;
    $("exerciseSheet").classList.add("hidden");
    $("exerciseSheet").setAttribute("aria-hidden", "true");
    state.reopenQueueAfterEdit = false;
    renderAll();
    if (shouldReopenQueue) openPanel("queue");
  }

  function updateCurrentDraft(field, rawValue) {
    if (rawValue === "") return;
    const exercise = getCurrentExercise();
    if (!exercise) return;
    hydrateDraft(false);

    const integer = field !== "weight";
    const fallback = state.session.currentDraft[field] ?? exercise[field] ?? 0;
    const value = cleanNumber(rawValue, fallback, integer);
    state.session.currentDraft[field] = value;

    if (field === "reps") exercise.reps = value;
    if (field === "weight") exercise.weight = value;
    if (field === "restSec") exercise.restSec = value;

    saveSession();
    renderQueue();
    updateDynamicTimers();
  }

  function stepCurrentDraft(field, direction) {
    const exercise = getCurrentExercise();
    if (!exercise) return;
    hydrateDraft(false);

    const dir = direction < 0 ? -1 : 1;
    const integer = field !== "weight";
    const fallback = state.session.currentDraft[field] ?? exercise[field] ?? 0;
    const step = currentStepFor(field, exercise);
    const value = cleanNumber(cleanNumber(fallback, 0, integer) + dir * step, 0, integer);
    updateCurrentDraft(field, value);
    renderCurrent();
  }

  function savePlanAsTemplate() {
    state.template = {
      name: state.session.templateName || "全身力量 A",
      updatedAt: isoNow(),
      exercises: state.session.plan.map((exercise) => ({
        id: uid("tpl"),
        name: exercise.name,
        sets: cleanNumber(exercise.sets, 1, true),
        reps: cleanNumber(exercise.reps, 0, true),
        weight: cleanNumber(exercise.weight, 0),
        restSec: cleanNumber(exercise.restSec, 60, true),
      })),
    };
    saveTemplate();
    flashButton($("saveTemplate"), "已保存");
  }

  function resetTemplateAndSession() {
    const hasWork = state.session.sets.length > 0 || state.session.phase === "work" || state.session.phase === "rest";
    if (hasWork && !window.confirm("重置会换回预置课表，并清掉当前未完成训练。")) return;
    state.template = deepClone(DEFAULT_TEMPLATE);
    state.session = createSessionFromTemplate(state.template);
    saveTemplate();
    saveSession();
    state.lastRecord = null;
    $("recordSection").classList.add("hidden");
    renderAll();
  }

  function startNewSession() {
    state.session = createSessionFromTemplate(state.template);
    state.lastRecord = null;
    saveSession();
    $("recordSection").classList.add("hidden");
    closePanels({ hideSecondary: true });
    renderAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function flashButton(button, text) {
    const original = button.textContent;
    button.textContent = text;
    button.disabled = true;
    setTimeout(() => {
      button.textContent = original;
      button.disabled = false;
    }, 1200);
  }

  function isMobileLayout() {
    return window.matchMedia("(max-width: 679px)").matches;
  }

  function panelByName(name) {
    return {
      queue: $("queueSection"),
      record: $("recordSection"),
      history: $("historySection"),
    }[name];
  }

  function closePanels(options = {}) {
    const { hideSecondary = false } = options;
    ["queue", "record", "history"].forEach((name) => {
      const panel = panelByName(name);
      if (!panel) return;
      panel.classList.remove("sheet-open");
      if (hideSecondary && name !== "queue") panel.classList.add("hidden");
    });
    $("mobileScrim").classList.remove("sheet-open");
    document.body.classList.remove("panel-active");
  }

  function closePanel(name, hide = false) {
    const panel = panelByName(name);
    if (!panel) return;
    panel.classList.remove("sheet-open");
    if (hide) panel.classList.add("hidden");
    const stillOpen = ["queue", "record", "history"].some((key) => panelByName(key)?.classList.contains("sheet-open"));
    if (!stillOpen) {
      $("mobileScrim").classList.remove("sheet-open");
      document.body.classList.remove("panel-active");
    }
  }

  function openPanel(name) {
    const panel = panelByName(name);
    if (!panel) return;

    ["queue", "record", "history"].forEach((key) => {
      if (key !== name) panelByName(key)?.classList.remove("sheet-open");
    });

    panel.classList.remove("hidden");
    panel.classList.add("sheet-open");

    if (isMobileLayout()) {
      $("mobileScrim").classList.add("sheet-open");
      document.body.classList.add("panel-active");
      return;
    }

    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderAll() {
    ensurePointer();
    renderHeader();
    renderSummary();
    renderCurrent();
    renderNextStrip();
    renderQueue();
    renderHistory();
    renderDock();
    if (state.lastRecord) renderRecord(state.lastRecord);
    updateDynamicTimers();
  }

  function renderHeader() {
    const started = state.session.startedAt ? formatDateTime(state.session.startedAt) : formatDateTime(state.session.createdAt);
    $("sessionDate").textContent = `${state.session.templateName || "全身力量"} · ${started}`;
  }

  function phaseText() {
    const phase = state.session.phase;
    if (phase === "work") return "训练";
    if (phase === "rest") return "休息";
    if (phase === "done") return "完成";
    return "准备";
  }

  function renderSummary() {
    $("progressSets").textContent = `${state.session.sets.length}/${totalPlannedSets()}`;
    $("progressVolume").textContent = `${Math.round(totalVolume() * 10) / 10}kg`;
    $("phaseLabel").textContent = phaseText();
  }

  function renderCurrent() {
    const exercise = getCurrentExercise();
    const primary = $("primaryAction");
    const secondary = $("secondaryAction");
    const finish = $("finishWorkout");
    const finishDock = $("finishWorkoutDock");
    $("currentPanel").classList.toggle("no-exercise", !exercise);

    if (!exercise) {
      const finishDisabled = state.session.status === "finished" || state.session.sets.length === 0;
      $("currentKicker").textContent = state.session.phase === "done" ? "全部完成" : "训练队列";
      $("currentName").textContent = state.session.phase === "done" ? "可以完成训练" : "先添加动作";
      $("currentSetLine").textContent =
        state.session.status === "finished"
          ? "本次记录已生成"
          : state.session.phase === "done"
            ? `${state.session.sets.length} 组已记录`
            : "没有计划动作";
      $("currentReps").value = "";
      $("currentWeight").value = "";
      $("currentRest").value = "";
      primary.textContent = state.session.status === "finished" ? "新训练" : state.session.phase === "done" ? "完成训练" : "添加动作";
      primary.disabled = false;
      secondary.textContent = "训练队列";
      secondary.disabled = false;
      finish.disabled = finishDisabled;
      finishDock.disabled = finishDisabled;
      return;
    }

    hydrateDraft(false);
    const draft = state.session.currentDraft;
    const completed = completedCount(exercise.id);
    const planned = cleanNumber(exercise.sets, 0, true);
    const lastSet = state.session.sets.find((set) => set.id === state.session.lastSetLogId);

    if (state.session.phase === "work") {
      $("currentKicker").textContent = "当前组";
      $("currentSetLine").textContent = `第 ${Math.min(completed + 1, planned)} / ${planned} 组`;
      primary.textContent = "休息";
      secondary.textContent = "换动作";
    } else if (state.session.phase === "rest") {
      $("currentKicker").textContent = "休息中";
      $("currentSetLine").textContent = lastSet ? `第 ${lastSet.setNumber} 组完成` : `第 ${completed} 组完成`;
      primary.textContent = "下一组";
      secondary.textContent = "跳过休息";
    } else {
      $("currentKicker").textContent = "下一个动作";
      $("currentSetLine").textContent = `第 ${Math.min(completed + 1, planned)} / ${planned} 组`;
      primary.textContent = "开始";
      secondary.textContent = "换动作";
    }

    $("currentName").textContent = exercise.name;
    $("currentReps").value = draft?.reps ?? exercise.reps;
    $("currentWeight").value = draft?.weight ?? exercise.weight;
    $("currentRest").value = draft?.restSec ?? exercise.restSec;
    $("currentWeight").step = String(currentStepFor("weight", exercise));
    primary.disabled = false;
    secondary.disabled = false;
    finish.disabled = false;
    finishDock.disabled = false;
  }

  function renderNextStrip() {
    const exercise = getCurrentExercise();
    const nextStrip = $("nextStrip");
    const label = $("nextStripLabel");
    const name = $("nextStripName");

    if (!exercise) {
      label.textContent = state.session.status === "finished" ? "记录" : "状态";
      name.textContent = state.session.status === "finished" ? "本次训练已保存" : "没有待完成动作";
      nextStrip.disabled = state.session.status === "finished";
      return;
    }

    const upcoming = findNextAfterCurrent();
    if (!upcoming) {
      label.textContent = "接下来";
      name.textContent = "全部完成";
      nextStrip.disabled = false;
      return;
    }

    const nextSet = completedCount(upcoming.id) + 1;
    const planned = cleanNumber(upcoming.sets, 0, true);
    label.textContent = state.session.phase === "rest" ? "休息后" : "当前";
    name.textContent = `${upcoming.name} · 第 ${Math.min(nextSet, planned)}/${planned} 组`;
    nextStrip.disabled = false;
  }

  function renderDock() {
    $("dockRecord").disabled = !state.lastRecord;
    $("finishWorkoutDock").disabled = state.session.status === "finished" || state.session.sets.length === 0;
  }

  function renderQueue() {
    const list = $("exerciseList");
    if (!state.session.plan.length) {
      list.innerHTML = '<div class="empty-state">没有动作</div>';
      return;
    }

    list.innerHTML = state.session.plan
      .map((exercise, index) => {
        const completed = completedCount(exercise.id);
        const planned = cleanNumber(exercise.sets, 0, true);
        const isActive = state.session.currentExerciseId === exercise.id;
        const isDone = completed >= planned;
        return `
          <article class="exercise-row ${isActive ? "active" : ""} ${isDone ? "done" : ""}" data-id="${exercise.id}">
            <div class="exercise-main">
              <div class="exercise-title-line">
                <div class="exercise-title">${escapeHtml(exercise.name)}</div>
                <span class="exercise-badge">${completed}/${planned}</span>
              </div>
              <div class="exercise-meta">${planned}组 · ${cleanNumber(exercise.reps, 0, true)}次 · ${cleanNumber(exercise.weight, 0)}kg · 休${cleanNumber(exercise.restSec, 0, true)}秒</div>
            </div>
            <div class="row-actions">
              <button class="icon-button" type="button" data-action="up" title="上移" aria-label="上移" ${index === 0 ? "disabled" : ""}>${icons.up}</button>
              <button class="icon-button" type="button" data-action="down" title="下移" aria-label="下移" ${index === state.session.plan.length - 1 ? "disabled" : ""}>${icons.down}</button>
              <button class="icon-button" type="button" data-action="edit" title="编辑" aria-label="编辑">${icons.edit}</button>
              <button class="icon-button" type="button" data-action="delete" title="删除" aria-label="删除">${icons.trash}</button>
            </div>
            <div class="row-wide-actions">
              <button type="button" data-action="activate">设为下一个</button>
              <button type="button" data-action="add-set">加一组</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderRecord(record) {
    $("recordStats").innerHTML = `
      <div><span>组数</span><strong>${record.totalSets}</strong></div>
      <div><span>容量</span><strong>${record.totalVolumeKg}kg</strong></div>
      <div><span>用时</span><strong>${formatClock(record.totalDurationSec)}</strong></div>
    `;

    const completedExercises = record.exercises.filter((exercise) => exercise.completedSets > 0);
    $("recordExercises").innerHTML = completedExercises.length
      ? completedExercises
          .map((exercise) => {
            const chips = exercise.sets
              .map(
                (set) =>
                  `<span class="set-chip">${set.setNumber}: ${cleanNumber(set.actualReps, 0, true)}次 × ${cleanNumber(set.actualWeight, 0)}kg · ${formatClock(set.workDurationSec)}</span>`,
              )
              .join("");
            return `
              <article class="record-row">
                <strong>${escapeHtml(exercise.name)}</strong>
                <div class="exercise-meta">${exercise.completedSets}/${exercise.plannedSets || exercise.completedSets}组 · ${Math.round(exercise.volumeKg * 10) / 10}kg</div>
                <div class="set-chips">${chips}</div>
              </article>
            `;
          })
          .join("")
      : '<div class="empty-state">没有已完成组</div>';

    $("recordJson").value = JSON.stringify(record, null, 2);
  }

  function renderHistory() {
    const list = $("historyList");
    if (!state.history.length) {
      list.innerHTML = '<div class="empty-state">暂无记录</div>';
      return;
    }

    list.innerHTML = state.history
      .map(
        (record) => `
          <article class="history-row" data-id="${record.id}">
            <div>
              <strong>${escapeHtml(formatDateTime(record.startedAt))} · ${escapeHtml(record.title || "力量训练")}</strong>
              <span>${record.totalSets}组 · ${record.totalVolumeKg}kg · ${formatClock(record.totalDurationSec)}</span>
            </div>
            <button class="secondary-action" type="button" data-action="view-history">查看</button>
          </article>
        `,
      )
      .join("");
  }

  function updateDynamicTimers() {
    const now = isoNow();
    const sessionEnd = state.session.finishedAt || now;
    const elapsed = state.session.startedAt ? secondsBetween(state.session.startedAt, sessionEnd) : 0;
    $("sessionElapsed").textContent = formatClock(elapsed);

    if (state.session.phase === "work") {
      $("mainTimer").textContent = formatClock(secondsBetween(state.session.workStartedAt, now));
      $("restMeterBar").style.width = "0%";
      return;
    }

    if (state.session.phase === "rest") {
      const elapsedRest = secondsBetween(state.session.restStartedAt, now);
      const target = cleanNumber(state.session.restTargetSec, 0, true);
      const remaining = target > 0 ? Math.max(0, target - elapsedRest) : elapsedRest;
      $("mainTimer").textContent = formatClock(remaining);
      $("restMeterBar").style.width = target > 0 ? `${Math.min(100, (elapsedRest / target) * 100)}%` : "100%";
      return;
    }

    $("mainTimer").textContent = "00:00";
    $("restMeterBar").style.width = state.session.phase === "done" ? "100%" : "0%";
  }

  async function copyRecord() {
    const text = $("recordJson").value;
    try {
      await navigator.clipboard.writeText(text);
      flashButton($("copyRecord"), "已复制");
    } catch {
      $("recordJson").focus();
      $("recordJson").select();
      flashButton($("copyRecord"), "已选中");
    }
  }

  function downloadRecord() {
    const text = $("recordJson").value;
    if (!text) return;
    const record = JSON.parse(text);
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `workout-${record.startedAt ? record.startedAt.slice(0, 10) : "record"}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    $("primaryAction").addEventListener("click", () => {
      if (state.session.status === "finished") {
        startNewSession();
        return;
      }
      if (!getCurrentExercise() && state.session.phase !== "done") {
        openExerciseEditor("add");
        return;
      }
      if (state.session.phase === "work") completeSetToRest();
      else if (state.session.phase === "rest") beginNextSet();
      else if (state.session.phase === "done") finishWorkout();
      else startSet();
    });

    $("secondaryAction").addEventListener("click", () => {
      if (state.session.phase === "rest") beginNextSet();
      else openPanel("queue");
    });

    $("focusQueue").addEventListener("click", () => {
      openPanel("queue");
    });

    $("finishWorkout").addEventListener("click", finishWorkout);
    $("finishWorkoutDock").addEventListener("click", finishWorkout);
    $("dockPlan").addEventListener("click", () => openPanel("queue"));
    $("dockRecord").addEventListener("click", () => {
      if (!state.lastRecord) return;
      renderRecord(state.lastRecord);
      openPanel("record");
    });
    $("dockHistory").addEventListener("click", () => openPanel("history"));
    $("nextStrip").addEventListener("click", () => openPanel("queue"));
    $("mobileScrim").addEventListener("click", () => closePanels({ hideSecondary: true }));
    $("closeQueue").addEventListener("click", () => closePanel("queue"));
    $("closeHistory").addEventListener("click", () => closePanel("history", true));
    $("addExercise").addEventListener("click", () => openExerciseEditor("add"));
    $("cancelExercise").addEventListener("click", closeExerciseEditor);
    $("exerciseSheet").addEventListener("click", (event) => {
      if (event.target === $("exerciseSheet")) closeExerciseEditor();
    });
    $("exerciseForm").addEventListener("submit", saveExerciseFromForm);

    $("currentReps").addEventListener("input", (event) => updateCurrentDraft("reps", event.target.value));
    $("currentWeight").addEventListener("input", (event) => updateCurrentDraft("weight", event.target.value));
    $("currentRest").addEventListener("input", (event) => updateCurrentDraft("restSec", event.target.value));
    document.querySelectorAll("[data-step-target]").forEach((button) => {
      button.addEventListener("click", () => {
        stepCurrentDraft(button.dataset.stepTarget, Number(button.dataset.stepDir || 1));
      });
    });

    $("exerciseList").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const row = event.target.closest(".exercise-row");
      const id = row?.dataset.id;
      const action = button.dataset.action;
      if (!id) return;

      if (action === "up") moveExercise(id, -1);
      if (action === "down") moveExercise(id, 1);
      if (action === "edit") openExerciseEditor("edit", id);
      if (action === "delete") deleteExercise(id);
      if (action === "activate") setActiveExercise(id);
      if (action === "add-set") incrementPlannedSet(id);
    });

    $("saveTemplate").addEventListener("click", savePlanAsTemplate);
    $("resetTemplate").addEventListener("click", resetTemplateAndSession);
    $("copyRecord").addEventListener("click", copyRecord);
    $("downloadRecord").addEventListener("click", downloadRecord);
    $("newSession").addEventListener("click", startNewSession);
    $("closeRecord").addEventListener("click", () => closePanel("record", true));

    $("historyToggle").addEventListener("click", () => {
      if ($("historySection").classList.contains("sheet-open") || !$("historySection").classList.contains("hidden")) closePanel("history", true);
      else openPanel("history");
    });

    $("historyList").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action='view-history']");
      if (!button) return;
      const id = event.target.closest(".history-row")?.dataset.id;
      const record = state.history.find((item) => item.id === id);
      if (!record) return;
      state.lastRecord = record;
      renderRecord(record);
      openPanel("record");
    });

    $("clearHistory").addEventListener("click", () => {
      if (!state.history.length) return;
      if (!window.confirm("清空所有历史记录？")) return;
      state.history = [];
      saveHistory();
      renderHistory();
    });
  }

  function boot() {
    state.template = loadJson(STORE.template, deepClone(DEFAULT_TEMPLATE));
    state.history = loadJson(STORE.history, []);
    state.session = loadJson(STORE.current, null) || createSessionFromTemplate(state.template);

    if (!Array.isArray(state.template.exercises) || !state.template.exercises.length) {
      state.template = deepClone(DEFAULT_TEMPLATE);
      saveTemplate();
    }

    if (!Array.isArray(state.session.plan)) {
      state.session = createSessionFromTemplate(state.template);
    }

    bindEvents();
    saveSession();
    renderAll();
    setInterval(updateDynamicTimers, 500);

    if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  boot();
})();
