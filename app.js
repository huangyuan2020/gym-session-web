(() => {
  const STORE = {
    template: "gym-session-template-v1",
    templates: "gym-session-templates-v1",
    activeTemplateId: "gym-session-active-template-v1",
    current: "gym-session-current-v1",
    history: "gym-session-history-v1",
  };

  const DEFAULT_TEMPLATE = {
    id: "tplset_full_body_a",
    name: "全身力量 A",
    updatedAt: new Date().toISOString(),
    exercises: [
      { id: "tpl_row_machine", name: "器械划船", sets: 1, reps: 12, weight: 15, restSec: 60 },
      { id: "tpl_assist_pullup", name: "辅助引体向上", sets: 4, reps: 10, weight: 60, restSec: 75 },
      { id: "tpl_rdl", name: "罗马尼亚硬拉", sets: 4, reps: 10, weight: 12, restSec: 75 },
      { id: "tpl_hack_press", name: "哈克推肩", sets: 3, reps: 10, weight: 0, restSec: 60 },
      { id: "tpl_chest_machine", name: "器械推胸", sets: 3, reps: 8, weight: 0, restSec: 60 },
      { id: "tpl_hip_abduction", name: "髋外展器械", sets: 4, reps: 12, weight: 40, restSec: 60 },
      { id: "tpl_db_curl_alt", name: "哑铃弯举交替单侧", sets: 6, reps: 12, weight: 3, restSec: 60 },
    ],
  };

  const $ = (id) => document.getElementById(id);

  const icons = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 15h10l1-15"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  };

  const state = {
    template: null,
    templates: [],
    activeTemplateId: null,
    session: null,
    history: [],
    editor: { mode: "add", exerciseId: null },
    lastRecord: null,
    reopenQueueAfterEdit: false,
    queuePointer: null,
    historyPointer: null,
    undoSnapshot: null,
    queuePickMode: false,
    planPress: null,
    queueTap: null,
    suppressQueueClickUntil: 0,
    suppressHistoryClickUntil: 0,
    suppressPlanClickUntil: 0,
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

  function formatTimeOnly(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", {
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
      templateId: template.id,
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

  function normalizeTemplate(template, fallbackName = "训练计划") {
    const source = template || {};
    const exercises = Array.isArray(source.exercises) ? source.exercises : [];
    return {
      id: source.id || uid("tplset"),
      name: cleanText(source.name) || fallbackName,
      updatedAt: source.updatedAt || isoNow(),
      exercises: exercises.map((exercise) => ({
        id: exercise.id || uid("tpl"),
        name: cleanText(exercise.name) || "未命名动作",
        sets: cleanNumber(exercise.sets ?? exercise.plannedSets, 1, true) || 1,
        reps: cleanNumber(exercise.reps ?? exercise.targetReps, 0, true),
        weight: cleanNumber(exercise.weight ?? exercise.targetWeight, 0),
        restSec: cleanNumber(exercise.restSec, 60, true),
      })),
    };
  }

  function templateFromSession(baseTemplate = state.template, name = state.session.templateName || "训练计划", options = {}) {
    const { freshExerciseIds = false } = options;
    return {
      id: baseTemplate?.id || uid("tplset"),
      name: cleanText(name) || "训练计划",
      updatedAt: isoNow(),
      exercises: state.session.plan.map((exercise, index) => ({
        id: freshExerciseIds ? uid(`tpl_${index + 1}`) : exercise.sourceId || exercise.id || uid("tpl"),
        name: exercise.name,
        sets: cleanNumber(exercise.sets, 1, true),
        reps: cleanNumber(exercise.reps, 0, true),
        weight: cleanNumber(exercise.weight, 0),
        restSec: cleanNumber(exercise.restSec, 60, true),
      })),
    };
  }

  function setActiveTemplate(templateId) {
    const template = state.templates.find((item) => item.id === templateId) || state.templates[0] || normalizeTemplate(DEFAULT_TEMPLATE, "全身力量 A");
    state.activeTemplateId = template.id;
    state.template = template;
  }

  function saveTemplates() {
    if (!state.templates.length && state.template) state.templates = [state.template];
    setActiveTemplate(state.activeTemplateId || state.template?.id || state.templates[0]?.id);
    saveJson(STORE.templates, state.templates);
    saveJson(STORE.activeTemplateId, state.activeTemplateId);
    saveJson(STORE.template, state.template);
  }

  function saveTemplate() {
    const index = state.templates.findIndex((template) => template.id === state.template?.id);
    if (index >= 0) state.templates[index] = state.template;
    else if (state.template) state.templates.push(state.template);
    saveTemplates();
  }

  function saveHistory() {
    saveJson(STORE.history, state.history.slice(0, 100));
  }

  function pushUndo(label) {
    if (!state.session || state.session.status === "finished") return;
    state.undoSnapshot = {
      label,
      session: deepClone(state.session),
    };
  }

  function undoLastAction() {
    if (!state.undoSnapshot?.session) return;
    state.session = deepClone(state.undoSnapshot.session);
    state.undoSnapshot = null;
    saveSession();
    renderAll();
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

  function nextTargetInfo() {
    const current = getCurrentExercise();
    const upcoming = findNextAfterCurrent();
    if (!upcoming) return null;
    const isSameExercise = current?.id === upcoming.id;
    const completed = completedCount(upcoming.id);
    const planned = cleanNumber(upcoming.sets, 0, true);
    return {
      exercise: upcoming,
      isSameExercise,
      completed,
      planned,
      setNumber: completed + 1,
      label: isSameExercise && completed > 0 ? "下一组" : "下个动作",
    };
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

    pushUndo("开始");
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

    pushUndo("完成一组");
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
    pushUndo(state.session.phase === "rest" ? "跳过休息" : "下一组");
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

  function setActiveExercise(exerciseId, options = {}) {
    const { keepPanelOpen = false, undo = true } = options;
    const exists = state.session.plan.some((exercise) => exercise.id === exerciseId);
    if (!exists) return;

    if (undo) pushUndo("换动作");
    if (state.session.phase === "rest") {
      finishRest();
      state.session.phase = "ready";
    } else if (state.session.phase === "done") {
      state.session.phase = "ready";
    }

    state.session.currentExerciseId = exerciseId;
    const exercise = getCurrentExercise();
    if (exercise && completedCount(exercise.id) >= cleanNumber(exercise.sets, 0, true)) {
      exercise.sets = completedCount(exercise.id) + 1;
    }
    hydrateDraft(true);
    saveSession();
    state.queuePickMode = false;
    if (!keepPanelOpen) closePanels();
    renderAll();
    $("currentName").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function skipCurrentExercise() {
    const exercise = getCurrentExercise();
    if (!exercise) return;
    pushUndo("跳过动作");
    if (state.session.phase === "rest") finishRest();
    if (state.session.phase === "work") {
      state.session.workStartedAt = null;
    }
    exercise.sets = completedCount(exercise.id);
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
    openPlanSavePrompt(`已删除 ${exercise.name}，要保存到训练计划吗？`);
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

    const isAddingExercise = state.editor.mode !== "edit";
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
    if (isAddingExercise) openPlanSavePrompt("已添加动作，要保存到训练计划吗？");
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

  function hasActiveWork() {
    return state.session?.sets?.length > 0 || state.session?.phase === "work" || state.session?.phase === "rest";
  }

  function switchTemplate(templateId) {
    if (templateId === state.activeTemplateId) return;
    if (hasActiveWork() && !window.confirm("切换计划会清掉当前未完成训练，是否继续？")) return;
    setActiveTemplate(templateId);
    state.session = createSessionFromTemplate(state.template);
    state.lastRecord = null;
    saveTemplates();
    saveSession();
    $("recordSection").classList.add("hidden");
    renderAll();
    openPanel("queue");
  }

  function deleteTemplate(templateId) {
    const template = state.templates.find((item) => item.id === templateId);
    if (!template) return;
    if (state.templates.length <= 1) {
      window.alert("至少保留一个训练计划。");
      return;
    }
    if (!window.confirm(`删除训练计划「${template.name}」？`)) return;

    const deletingActive = templateId === state.activeTemplateId;
    if (deletingActive && hasActiveWork() && !window.confirm("删除当前计划会清掉当前未完成训练，是否继续？")) return;

    state.templates = state.templates.filter((item) => item.id !== templateId);
    if (deletingActive) {
      setActiveTemplate(state.templates[0]?.id);
      state.session = createSessionFromTemplate(state.template);
      state.lastRecord = null;
      $("recordSection").classList.add("hidden");
      saveSession();
    } else {
      setActiveTemplate(state.activeTemplateId);
    }

    saveTemplates();
    renderAll();
    openPanel("queue");
  }

  function beginPlanPress(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const button = event.target.closest("button[data-template-id]");
    if (!button) return;
    const templateId = button.dataset.templateId;
    window.clearTimeout(state.planPress?.timer);
    state.planPress = {
      pointerId: event.pointerId,
      templateId,
      startX: event.clientX,
      startY: event.clientY,
      triggered: false,
      timer: window.setTimeout(() => {
        if (!state.planPress || state.planPress.pointerId !== event.pointerId) return;
        state.planPress.triggered = true;
        state.suppressPlanClickUntil = Date.now() + 700;
        deleteTemplate(templateId);
      }, 560),
    };
  }

  function movePlanPress(event) {
    const press = state.planPress;
    if (!press || press.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
    if (distance > 12) cancelPlanPress();
  }

  function finishPlanPress(event) {
    if (!state.planPress || state.planPress.pointerId !== event.pointerId) return;
    cancelPlanPress();
  }

  function cancelPlanPress() {
    if (state.planPress?.timer) window.clearTimeout(state.planPress.timer);
    state.planPress = null;
  }

  function overwriteActiveTemplate() {
    const next = templateFromSession(state.template, state.template?.name || state.session.templateName || "训练计划");
    const index = state.templates.findIndex((template) => template.id === next.id);
    if (index >= 0) state.templates[index] = next;
    else state.templates.push(next);
    state.template = next;
    state.activeTemplateId = next.id;
    state.session.templateId = next.id;
    state.session.templateName = next.name;
    state.session.plan.forEach((exercise, index) => {
      exercise.sourceId = next.exercises[index]?.id || exercise.sourceId;
    });
    saveTemplates();
    saveSession();
    renderAll();
    openPanel("queue");
    closePlanSavePrompt();
  }

  function saveAsNewTemplate() {
    const name = cleanText(window.prompt("新计划名称", `${state.session.templateName || "训练计划"} 副本`));
    if (!name) return;
    const next = templateFromSession({ id: uid("tplset") }, name, { freshExerciseIds: true });
    state.templates.push(next);
    state.template = next;
    state.activeTemplateId = next.id;
    state.session.templateId = next.id;
    state.session.templateName = next.name;
    state.session.plan.forEach((exercise, index) => {
      exercise.sourceId = next.exercises[index]?.id || exercise.sourceId;
    });
    saveTemplates();
    saveSession();
    renderAll();
    openPanel("queue");
    closePlanSavePrompt();
  }

  function openPlanSavePrompt(message = "训练队列里的动作有增减，要保存到计划吗？") {
    const sheet = $("planSaveSheet");
    if (!sheet) return;
    $("planSaveMessage").textContent = message;
    sheet.classList.remove("hidden");
    sheet.setAttribute("aria-hidden", "false");
  }

  function closePlanSavePrompt() {
    const sheet = $("planSaveSheet");
    if (!sheet) return;
    sheet.classList.add("hidden");
    sheet.setAttribute("aria-hidden", "true");
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
      data: $("dataSection"),
      history: $("historySection"),
    }[name];
  }

  function closePanels(options = {}) {
    const { hideSecondary = false } = options;
    state.queuePickMode = false;
    ["queue", "record", "data", "history"].forEach((name) => {
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
    if (name === "queue") state.queuePickMode = false;
    panel.classList.remove("sheet-open");
    if (hide) panel.classList.add("hidden");
    const stillOpen = ["queue", "record", "data", "history"].some((key) => panelByName(key)?.classList.contains("sheet-open"));
    if (!stillOpen) {
      $("mobileScrim").classList.remove("sheet-open");
      document.body.classList.remove("panel-active");
    }
  }

  function openPanel(name) {
    const panel = panelByName(name);
    if (!panel) return;
    if (name !== "queue") state.queuePickMode = false;

    ["queue", "record", "data", "history"].forEach((key) => {
      if (key !== name) panelByName(key)?.classList.remove("sheet-open");
    });

    if (name === "data") renderAnalytics();
    panel.classList.remove("hidden");

    if (name === "queue") {
      panel.classList.remove("sheet-open");
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    panel.classList.add("sheet-open");

    if (isMobileLayout()) {
      $("mobileScrim").classList.add("sheet-open");
      document.body.classList.add("panel-active");
      return;
    }

    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openQueuePickMode() {
    state.queuePickMode = true;
    openPanel("queue");
    renderQueue();
  }

  function openQueueEditMode() {
    state.queuePickMode = false;
    openPanel("queue");
    renderQueue();
  }

  function renderAll() {
    ensurePointer();
    renderHeader();
    renderSummary();
    renderCurrent();
    renderNextStrip();
    renderPlanTabs();
    renderQueue();
    renderHistory();
    renderAnalytics();
    renderDock();
    if (state.lastRecord) renderRecord(state.lastRecord);
    updateDynamicTimers();
  }

  function renderHeader() {
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
    const undoButton = $("undoAction");
    const finish = $("finishWorkout");
    const finishTop = $("finishWorkoutTop");
    $("currentPanel").classList.toggle("no-exercise", !exercise);

    if (!exercise) {
      const finishDisabled = state.session.status === "finished" || state.session.sets.length === 0;
      if ($("currentKicker")) $("currentKicker").textContent = state.session.phase === "done" ? "全部完成" : "训练队列";
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
      undoButton.disabled = !state.undoSnapshot;
      finish.disabled = finishDisabled;
      finishTop.disabled = finishDisabled;
      return;
    }

    hydrateDraft(false);
    const draft = state.session.currentDraft;
    const completed = completedCount(exercise.id);
    const planned = cleanNumber(exercise.sets, 0, true);
    const lastSet = state.session.sets.find((set) => set.id === state.session.lastSetLogId);

    if (state.session.phase === "work") {
      if ($("currentKicker")) $("currentKicker").textContent = "当前组";
      $("currentSetLine").textContent = `第 ${Math.min(completed + 1, planned)} / ${planned} 组`;
      primary.textContent = "休息";
    } else if (state.session.phase === "rest") {
      if ($("currentKicker")) $("currentKicker").textContent = "休息中";
      $("currentSetLine").textContent = lastSet ? `第 ${lastSet.setNumber} 组完成` : `第 ${completed} 组完成`;
      primary.textContent = "下一组";
    } else {
      if ($("currentKicker")) $("currentKicker").textContent = completed > 0 ? "下一组" : "下个动作";
      $("currentSetLine").textContent = `第 ${Math.min(completed + 1, planned)} / ${planned} 组`;
      primary.textContent = "开始";
    }

    $("currentName").textContent = exercise.name;
    $("currentReps").value = draft?.reps ?? exercise.reps;
    $("currentWeight").value = draft?.weight ?? exercise.weight;
    $("currentRest").value = draft?.restSec ?? exercise.restSec;
    $("currentWeight").step = String(currentStepFor("weight", exercise));
    primary.disabled = false;
    undoButton.disabled = !state.undoSnapshot;
    finish.disabled = false;
    finishTop.disabled = false;
  }

  function renderNextStrip() {
    const nextStrip = $("nextStrip");
    if (!nextStrip) return;
    const exercise = getCurrentExercise();
    const label = $("nextStripLabel");
    const name = $("nextStripName");

    if (!exercise) {
      label.textContent = state.session.status === "finished" ? "记录" : "状态";
      name.textContent = state.session.status === "finished" ? "本次训练已保存" : "没有待完成动作";
      nextStrip.disabled = state.session.status === "finished";
      return;
    }

    const target = nextTargetInfo();
    if (!target) {
      label.textContent = "接下来";
      name.textContent = "全部完成";
      nextStrip.disabled = false;
      return;
    }

    label.textContent = state.session.phase === "rest" ? `休息后 · ${target.label}` : target.label;
    name.textContent = `${target.exercise.name} · 第 ${Math.min(target.setNumber, target.planned)}/${target.planned} 组`;
    nextStrip.disabled = false;
  }

  function renderDock() {
    if ($("dockRecord")) $("dockRecord").disabled = !state.lastRecord;
    $("finishWorkoutTop").disabled = state.session.status === "finished" || state.session.sets.length === 0;
  }

  function renderPlanTabs() {
    const list = $("planTabs");
    if (!list) return;
    list.innerHTML = state.templates
      .map(
        (template) => `
          <button class="plan-tab ${template.id === state.activeTemplateId ? "active" : ""}" type="button" data-template-id="${template.id}">
            ${escapeHtml(template.name)}
          </button>
        `,
      )
      .join("");
    if ($("confirmOverwritePlan")) $("confirmOverwritePlan").disabled = !state.session.plan.length;
    if ($("confirmSaveAsPlan")) $("confirmSaveAsPlan").disabled = !state.session.plan.length;
  }

  function renderQueue() {
    const list = $("exerciseList");
    $("queueSection").classList.toggle("pick-mode", true);
    if (!state.session.plan.length) {
      list.innerHTML = '<div class="empty-state">没有动作</div>';
      return;
    }

    list.innerHTML = state.session.plan
      .map((exercise, index) => ({ exercise, index }))
      .sort((a, b) => {
        const aDone = completedCount(a.exercise.id) >= cleanNumber(a.exercise.sets, 0, true);
        const bDone = completedCount(b.exercise.id) >= cleanNumber(b.exercise.sets, 0, true);
        if (aDone !== bDone) return aDone ? 1 : -1;
        return a.index - b.index;
      })
      .map(({ exercise }) => {
        const completed = completedCount(exercise.id);
        const planned = cleanNumber(exercise.sets, 0, true);
        const isActive = state.session.currentExerciseId === exercise.id;
        const isDone = completed >= planned;
        const reps = cleanNumber(exercise.reps, 0, true);
        const weight = cleanNumber(exercise.weight, 0);
        const rest = cleanNumber(exercise.restSec, 0, true);
        const statusText = isDone ? "完成" : isActive ? "当前" : "待做";
        return `
          <article class="exercise-row ${isActive ? "active" : ""} ${isDone ? "done" : ""}" data-id="${exercise.id}">
            <div class="swipe-actions" aria-hidden="true">
              <button class="swipe-action delete" type="button" data-action="delete">删除</button>
            </div>
            <div class="exercise-card">
              <button class="exercise-main" type="button" data-action="pick">
                <span class="exercise-status">${statusText}</span>
                <div class="exercise-title-line">
                  <div class="exercise-title">${escapeHtml(exercise.name)}</div>
                  <span class="exercise-badge">${completed}/${planned}</span>
                </div>
                <div class="exercise-meta">${reps}次 · ${weight}kg · 休${rest}s</div>
              </button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function closeSwipedRows(exceptRow = null) {
    document.querySelectorAll(".exercise-row.swiped").forEach((row) => {
      if (row === exceptRow) return;
      row.classList.remove("swiped");
      const card = row.querySelector(".exercise-card");
      if (card) card.style.transform = "";
    });
  }

  function clearQueueTap() {
    if (state.queueTap?.timer) window.clearTimeout(state.queueTap.timer);
    state.queueTap = null;
  }

  function handleQueuePick(row, exerciseId) {
    if (row.classList.contains("swiped")) {
      closeSwipedRows();
      return;
    }
    closeSwipedRows();

    if (state.queueTap?.id === exerciseId) {
      clearQueueTap();
      openExerciseEditor("edit", exerciseId);
      return;
    }

    clearQueueTap();
    state.queueTap = {
      id: exerciseId,
      timer: window.setTimeout(() => {
        state.queueTap = null;
        setActiveExercise(exerciseId);
      }, 260),
    };
  }

  function beginQueueGesture(event, pointerId, clientX, clientY, pointerType = "touch", button = 0) {
    if (state.queuePointer) return;
    if (pointerType === "mouse" && button !== 0) return;
    if (event.target.closest(".swipe-actions button")) return;
    const row = event.target.closest(".exercise-row");
    if (!row) return;

    const pointer = {
      row,
      id: row.dataset.id,
      pointerId,
      startX: clientX,
      startY: clientY,
      mode: null,
      opened: row.classList.contains("swiped"),
    };
    state.queuePointer = pointer;
    if (Number.isFinite(pointerId)) row.setPointerCapture?.(pointerId);
  }

  function beginQueuePointer(event) {
    beginQueueGesture(event, event.pointerId, event.clientX, event.clientY, event.pointerType, event.button);
  }

  function moveQueueGesture(event, pointerId, clientX, clientY) {
    const pointer = state.queuePointer;
    if (!pointer || pointer.pointerId !== pointerId) return;
    const card = pointer.row.querySelector(".exercise-card");
    if (!card) return;

    const dx = clientX - pointer.startX;
    const dy = clientY - pointer.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (!pointer.mode) {
      if (Math.max(absX, absY) < 8) return;
      if (absX > absY * 1.15) {
        pointer.mode = "swipe";
      } else {
        return;
      }
      closeSwipedRows(pointer.row);
      pointer.row.classList.add("swiping");
      card.style.transition = "none";
    }

    if (pointer.mode === "swipe") {
      event.preventDefault();
      const base = pointer.opened ? -72 : 0;
      const offset = Math.max(-72, Math.min(16, base + dx));
      card.style.transform = `translateX(${offset > 0 ? offset * 0.25 : offset}px)`;
      return;
    }

  }

  function moveQueuePointer(event) {
    moveQueueGesture(event, event.pointerId, event.clientX, event.clientY);
  }

  function finishQueueGesture(event, pointerId, clientX, clientY) {
    const pointer = state.queuePointer;
    if (!pointer || pointer.pointerId !== pointerId) return;
    const card = pointer.row.querySelector(".exercise-card");
    const dx = clientX - pointer.startX;

    if (Number.isFinite(pointerId)) pointer.row.releasePointerCapture?.(pointerId);
    pointer.row.classList.remove("swiping");
    if (card) {
      card.style.transition = "";
      card.style.transform = "";
    }
    pointer.row.style.transition = "";
    pointer.row.style.transform = "";

    if (pointer.mode === "swipe") {
      const shouldOpen = pointer.opened ? dx < 28 : dx < -42;
      pointer.row.classList.toggle("swiped", shouldOpen);
      state.suppressQueueClickUntil = Date.now() + 350;
    }

    state.queuePointer = null;
  }

  function finishQueuePointer(event) {
    finishQueueGesture(event, event.pointerId, event.clientX, event.clientY);
  }

  function cancelQueueGesture(pointerId) {
    const pointer = state.queuePointer;
    if (!pointer || pointer.pointerId !== pointerId) return;
    const card = pointer.row.querySelector(".exercise-card");
    if (Number.isFinite(pointerId)) pointer.row.releasePointerCapture?.(pointerId);
    pointer.row.classList.remove("swiping");
    if (card) {
      card.style.transition = "";
      card.style.transform = "";
    }
    pointer.row.style.transition = "";
    pointer.row.style.transform = "";
    state.queuePointer = null;
  }

  function cancelQueuePointer(event) {
    cancelQueueGesture(event.pointerId);
  }

  function beginQueueMouse(event) {
    beginQueueGesture(event, "mouse", event.clientX, event.clientY, "mouse", event.button);
  }

  function moveQueueMouse(event) {
    moveQueueGesture(event, "mouse", event.clientX, event.clientY);
  }

  function finishQueueMouse(event) {
    finishQueueGesture(event, "mouse", event.clientX, event.clientY);
  }

  function beginQueueTouch(event) {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    beginQueueGesture(event, "touch", touch.clientX, touch.clientY, "touch", 0);
  }

  function moveQueueTouch(event) {
    if (!event.touches.length) return;
    const touch = event.touches[0];
    moveQueueGesture(event, "touch", touch.clientX, touch.clientY);
  }

  function finishQueueTouch(event) {
    const touch = event.changedTouches[0];
    if (!touch) return;
    finishQueueGesture(event, "touch", touch.clientX, touch.clientY);
  }

  function parseTime(iso) {
    const time = new Date(iso || "").getTime();
    return Number.isFinite(time) ? time : null;
  }

  function exerciseColor(name) {
    const palette = ["#2f7d5b", "#356fc2", "#b05d3b", "#7b5aa6", "#16817a", "#b47b1c", "#5f7564", "#9b4d55"];
    const text = String(name || "");
    const hash = [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return palette[hash % palette.length];
  }

  function buildTimelineItems(record) {
    const rawSets = [...(record.sets || [])].sort((a, b) => (parseTime(a.workStartedAt) || 0) - (parseTime(b.workStartedAt) || 0));
    const items = [];

    rawSets.forEach((set) => {
      const workStart = parseTime(set.workStartedAt);
      const workEnd = parseTime(set.workEndedAt);
      if (workStart && workEnd && workEnd >= workStart) {
        items.push({
          type: "work",
          color: exerciseColor(set.exerciseName),
          startIso: set.workStartedAt,
          endIso: set.workEndedAt,
          start: workStart,
          end: workEnd,
          title: `${set.exerciseName || "未命名动作"} 第${cleanNumber(set.setNumber, 1, true)}组`,
          meta: `${cleanNumber(set.actualReps, 0, true)}次 × ${formatKg(set.actualWeight)} · ${formatClock(set.workDurationSec)}`,
        });
      }

      const restStart = parseTime(set.restStartedAt);
      const restEnd = parseTime(set.restEndedAt);
      if (restStart && restEnd && restEnd > restStart) {
        items.push({
          type: "rest",
          color: "#c3c8bd",
          startIso: set.restStartedAt,
          endIso: set.restEndedAt,
          start: restStart,
          end: restEnd,
          title: "休息",
          meta: `目标 ${formatClock(set.restTargetSec)} · 实际 ${formatClock(set.restDurationSec)}`,
        });
      }
    });

    return items.sort((a, b) => a.start - b.start);
  }

  function renderRecordTimeline(record) {
    const target = $("recordTimeline");
    const items = buildTimelineItems(record);
    if (!items.length) {
      target.innerHTML = "";
      target.classList.add("hidden");
      return;
    }
    target.classList.remove("hidden");

    const start = parseTime(record.startedAt) || items[0].start;
    const end = parseTime(record.finishedAt) || items[items.length - 1].end;
    const totalMs = Math.max(1, end - start);
    const railHeight = Math.min(520, Math.max(220, items.length * 42));
    const segments = items
      .map((item) => {
        const top = Math.max(0, ((item.start - start) / totalMs) * 100);
        const height = Math.max(1.4, ((item.end - item.start) / totalMs) * 100);
        return `<span class="timeline-segment ${item.type}" style="--top:${top}%;--height:${height}%;--tone:${item.color}"></span>`;
      })
      .join("");

    const rows = items
      .map(
        (item) => `
          <div class="timeline-event ${item.type}" style="--tone:${item.color}">
            <div class="timeline-time">${formatTimeOnly(item.startIso)}-${formatTimeOnly(item.endIso)}</div>
            <div class="timeline-copy">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.meta)}</span>
            </div>
          </div>
        `,
      )
      .join("");

    target.innerHTML = `
      <div class="timeline-heading">
        <strong>时间线</strong>
        <span>${formatClock(Math.round(totalMs / 1000))}</span>
      </div>
      <div class="timeline-layout">
        <div class="timeline-rail" style="height:${railHeight}px">${segments}</div>
        <div class="timeline-list">${rows}</div>
      </div>
    `;
  }

  function renderRecord(record) {
    renderRecordTimeline(record);
    $("recordJson").value = JSON.stringify(record, null, 2);
  }

  function shortDate(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
  }

  function formatKg(value) {
    const next = Math.round(cleanNumber(value, 0) * 10) / 10;
    return `${next}kg`;
  }

  function estimateOneRm(weight, reps) {
    const actualWeight = cleanNumber(weight, 0);
    const actualReps = cleanNumber(reps, 0, true);
    if (actualWeight <= 0) return actualReps;
    return Math.round(actualWeight * (1 + actualReps / 30) * 10) / 10;
  }

  function sortedHistory() {
    return [...state.history].sort((a, b) => new Date(a.finishedAt || a.startedAt).getTime() - new Date(b.finishedAt || b.startedAt).getTime());
  }

  function setsByExerciseFromRecord(record) {
    if (Array.isArray(record.exercises) && record.exercises.length) {
      return record.exercises
        .map((exercise) => ({
          name: exercise.name,
          sets: Array.isArray(exercise.sets) ? exercise.sets : [],
        }))
        .filter((exercise) => exercise.name && exercise.sets.length);
    }

    const grouped = new Map();
    (record.sets || []).forEach((set) => {
      const name = set.exerciseName || "未命名动作";
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name).push(set);
    });
    return [...grouped.entries()].map(([name, sets]) => ({ name, sets }));
  }

  function bestSetSummary(sets) {
    return sets.reduce(
      (best, set) => {
        const reps = cleanNumber(set.actualReps, 0, true);
        const weight = cleanNumber(set.actualWeight, 0);
        const e1rm = estimateOneRm(weight, reps);
        const score = e1rm * 1000 + weight * 10 + reps;
        return score > best.score ? { reps, weight, e1rm, score } : best;
      },
      { reps: 0, weight: 0, e1rm: 0, score: -1 },
    );
  }

  function buildAnalytics() {
    const records = sortedHistory();
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const recentVolume = records
      .filter((record) => new Date(record.finishedAt || record.startedAt).getTime() >= thirtyDaysAgo)
      .reduce((sum, record) => sum + cleanNumber(record.totalVolumeKg, 0), 0);

    const exerciseMap = new Map();
    records.forEach((record) => {
      const date = record.finishedAt || record.startedAt;
      setsByExerciseFromRecord(record).forEach((exercise) => {
        const sets = exercise.sets.filter((set) => cleanNumber(set.actualReps, 0, true) > 0);
        if (!sets.length) return;
        const best = bestSetSummary(sets);
        const volume = Math.round(totalVolume(sets) * 10) / 10;
        if (!exerciseMap.has(exercise.name)) exerciseMap.set(exercise.name, []);
        exerciseMap.get(exercise.name).push({
          recordId: record.id,
          date,
          label: shortDate(date),
          bestWeight: best.weight,
          bestReps: best.reps,
          bestE1rm: best.e1rm,
          volume,
          sets: sets.length,
        });
      });
    });

    const exercises = [...exerciseMap.entries()]
      .map(([name, entries]) => {
        const ordered = entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const latest = ordered[ordered.length - 1];
        const previous = ordered[ordered.length - 2] || null;
        const best = ordered.reduce((top, entry) => (entry.bestE1rm > top.bestE1rm ? entry : top), ordered[0]);
        const delta = previous ? Math.round((latest.bestE1rm - previous.bestE1rm) * 10) / 10 : null;
        const isPr = latest.recordId === best.recordId && ordered.length > 1;
        return { name, entries: ordered, latest, previous, best, delta, isPr };
      })
      .sort((a, b) => new Date(b.latest.date).getTime() - new Date(a.latest.date).getTime());

    const prCount = exercises.filter((exercise) => exercise.isPr).length;
    return { records, recentVolume: Math.round(recentVolume * 10) / 10, exercises, prCount };
  }

  function progressBadge(exercise) {
    if (!exercise.previous) return { text: "首次", tone: "flat" };
    if (exercise.delta > 0.4) return { text: exercise.isPr ? `PR +${exercise.delta}` : `+${exercise.delta}`, tone: "" };
    if (exercise.delta < -0.4) return { text: `${exercise.delta}`, tone: "down" };
    return { text: "持平", tone: "flat" };
  }

  function renderAnalytics() {
    const analytics = buildAnalytics();
    const records = analytics.records;
    if (!records.length) {
      $("analyticsSummary").innerHTML = `
        <div class="analytics-metric"><span>训练</span><strong>0</strong></div>
        <div class="analytics-metric"><span>30天容量</span><strong>0kg</strong></div>
        <div class="analytics-metric"><span>动作</span><strong>0</strong></div>
      `;
      $("volumeTrendLabel").textContent = "";
      $("exerciseTrendLabel").textContent = "";
      $("volumeChart").innerHTML = '<div class="empty-state">完成几次训练后，这里会出现趋势</div>';
      $("exerciseAnalytics").innerHTML = '<div class="empty-state">暂无动作数据</div>';
      return;
    }

    $("analyticsSummary").innerHTML = `
      <div class="analytics-metric"><span>训练</span><strong>${records.length}</strong></div>
      <div class="analytics-metric"><span>30天容量</span><strong>${formatKg(analytics.recentVolume)}</strong></div>
      <div class="analytics-metric"><span>本次PR</span><strong>${analytics.prCount}</strong></div>
    `;

    const recent = records.slice(-8);
    const maxVolume = Math.max(...recent.map((record) => cleanNumber(record.totalVolumeKg, 0)), 1);
    $("volumeTrendLabel").textContent = `${shortDate(recent[0]?.finishedAt || recent[0]?.startedAt)} - ${shortDate(recent[recent.length - 1]?.finishedAt || recent[recent.length - 1]?.startedAt)}`;
    $("volumeChart").innerHTML = recent
      .map((record) => {
        const volume = cleanNumber(record.totalVolumeKg, 0);
        const height = Math.max(4, Math.round((volume / maxVolume) * 88));
        return `
          <div class="volume-bar" title="${formatKg(volume)}">
            <span class="volume-bar-fill" style="height:${height}px"></span>
            <span class="volume-bar-label">${shortDate(record.finishedAt || record.startedAt)}</span>
          </div>
        `;
      })
      .join("");

    const visibleExercises = analytics.exercises.slice(0, 10);
    $("exerciseTrendLabel").textContent = `${analytics.exercises.length} 个动作`;
    $("exerciseAnalytics").innerHTML = visibleExercises.length
      ? visibleExercises
          .map((exercise) => {
            const badge = progressBadge(exercise);
            const max = Math.max(...exercise.entries.map((entry) => entry.bestE1rm), 1);
            const bars = exercise.entries
              .slice(-8)
              .map((entry) => `<span title="${entry.label} ${entry.bestE1rm}" style="height:${Math.max(3, Math.round((entry.bestE1rm / max) * 34))}px"></span>`)
              .join("");
            return `
              <article class="exercise-progress-card">
                <div class="progress-title-line">
                  <strong>${escapeHtml(exercise.name)}</strong>
                  <span class="progress-badge ${badge.tone}">${escapeHtml(badge.text)}</span>
                </div>
                <div class="progress-stats">
                  <div><span>最新最好</span><strong>${formatKg(exercise.latest.bestWeight)} × ${exercise.latest.bestReps}</strong></div>
                  <div><span>估算1RM</span><strong>${exercise.latest.bestE1rm}</strong></div>
                  <div><span>最好纪录</span><strong>${formatKg(exercise.best.bestWeight)} × ${exercise.best.bestReps}</strong></div>
                </div>
                <div class="sparkline">${bars}</div>
              </article>
            `;
          })
          .join("")
      : '<div class="empty-state">暂无动作数据</div>';
  }

  function buildAnalysisSummary() {
    const analytics = buildAnalytics();
    const lines = [
      `训练次数：${analytics.records.length}`,
      `近30天容量：${formatKg(analytics.recentVolume)}`,
      `本次刷新动作数：${analytics.prCount}`,
      "",
      "动作趋势：",
    ];
    analytics.exercises.slice(0, 20).forEach((exercise) => {
      const badge = progressBadge(exercise);
      const previous = exercise.previous ? `上次 ${formatKg(exercise.previous.bestWeight)}x${exercise.previous.bestReps}` : "首次记录";
      lines.push(`- ${exercise.name}: 最新 ${formatKg(exercise.latest.bestWeight)}x${exercise.latest.bestReps}, ${previous}, ${badge.text}, 估算1RM ${exercise.latest.bestE1rm}`);
    });
    return lines.join("\n");
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
            <div class="swipe-actions" aria-hidden="true">
              <button class="swipe-action delete" type="button" data-action="delete-history">删除</button>
            </div>
            <button class="history-card" type="button" data-action="open-history">
              <strong>${escapeHtml(formatDateTime(record.startedAt))} · ${escapeHtml(record.title || "力量训练")}</strong>
              <span>${record.totalSets}组 · ${record.totalVolumeKg}kg · ${formatClock(record.totalDurationSec)}</span>
            </button>
          </article>
        `,
      )
      .join("");
  }

  function deleteHistoryRecord(recordId) {
    const before = state.history.length;
    state.history = state.history.filter((record) => record.id !== recordId);
    if (state.history.length === before) return;
    if (state.lastRecord?.id === recordId) {
      state.lastRecord = null;
      closePanel("record", true);
    }
    saveHistory();
    renderAll();
    openPanel("history");
  }

  function closeSwipedHistoryRows(exceptRow = null) {
    document.querySelectorAll(".history-row.swiped").forEach((row) => {
      if (row === exceptRow) return;
      row.classList.remove("swiped");
      const card = row.querySelector(".history-card");
      if (card) card.style.transform = "";
    });
  }

  function beginHistoryGesture(event, pointerId, clientX, clientY, pointerType = "touch", button = 0) {
    if (state.historyPointer) return;
    if (pointerType === "mouse" && button !== 0) return;
    if (event.target.closest(".swipe-actions button")) return;
    const row = event.target.closest(".history-row");
    if (!row) return;
    state.historyPointer = {
      row,
      id: row.dataset.id,
      pointerId,
      startX: clientX,
      startY: clientY,
      mode: null,
      opened: row.classList.contains("swiped"),
    };
    if (Number.isFinite(pointerId)) row.setPointerCapture?.(pointerId);
  }

  function moveHistoryGesture(event, pointerId, clientX, clientY) {
    const pointer = state.historyPointer;
    if (!pointer || pointer.pointerId !== pointerId) return;
    const card = pointer.row.querySelector(".history-card");
    if (!card) return;
    const dx = clientX - pointer.startX;
    const dy = clientY - pointer.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (!pointer.mode) {
      if (Math.max(absX, absY) < 8) return;
      if (absX <= absY * 1.15) return;
      pointer.mode = "swipe";
      closeSwipedHistoryRows(pointer.row);
      pointer.row.classList.add("swiping");
      card.style.transition = "none";
    }

    event.preventDefault();
    const base = pointer.opened ? -72 : 0;
    const offset = Math.max(-72, Math.min(16, base + dx));
    card.style.transform = `translateX(${offset > 0 ? offset * 0.25 : offset}px)`;
  }

  function finishHistoryGesture(event, pointerId, clientX) {
    const pointer = state.historyPointer;
    if (!pointer || pointer.pointerId !== pointerId) return;
    const card = pointer.row.querySelector(".history-card");
    const dx = clientX - pointer.startX;
    if (Number.isFinite(pointerId)) pointer.row.releasePointerCapture?.(pointerId);
    pointer.row.classList.remove("swiping");
    if (card) {
      card.style.transition = "";
      card.style.transform = "";
    }

    if (pointer.mode === "swipe") {
      const shouldOpen = pointer.opened ? dx < 28 : dx < -42;
      pointer.row.classList.toggle("swiped", shouldOpen);
      state.suppressHistoryClickUntil = Date.now() + 350;
    }
    state.historyPointer = null;
  }

  function cancelHistoryGesture(pointerId) {
    const pointer = state.historyPointer;
    if (!pointer || pointer.pointerId !== pointerId) return;
    const card = pointer.row.querySelector(".history-card");
    if (Number.isFinite(pointerId)) pointer.row.releasePointerCapture?.(pointerId);
    pointer.row.classList.remove("swiping");
    if (card) {
      card.style.transition = "";
      card.style.transform = "";
    }
    state.historyPointer = null;
  }

  function beginHistoryPointer(event) {
    beginHistoryGesture(event, event.pointerId, event.clientX, event.clientY, event.pointerType, event.button);
  }

  function moveHistoryPointer(event) {
    moveHistoryGesture(event, event.pointerId, event.clientX, event.clientY);
  }

  function finishHistoryPointer(event) {
    finishHistoryGesture(event, event.pointerId, event.clientX);
  }

  function beginHistoryMouse(event) {
    beginHistoryGesture(event, "history-mouse", event.clientX, event.clientY, "mouse", event.button);
  }

  function moveHistoryMouse(event) {
    moveHistoryGesture(event, "history-mouse", event.clientX, event.clientY);
  }

  function finishHistoryMouse(event) {
    finishHistoryGesture(event, "history-mouse", event.clientX);
  }

  function beginHistoryTouch(event) {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    beginHistoryGesture(event, "history-touch", touch.clientX, touch.clientY, "touch", 0);
  }

  function moveHistoryTouch(event) {
    if (!event.touches.length) return;
    const touch = event.touches[0];
    moveHistoryGesture(event, "history-touch", touch.clientX, touch.clientY);
  }

  function finishHistoryTouch(event) {
    const touch = event.changedTouches[0];
    if (!touch) return;
    finishHistoryGesture(event, "history-touch", touch.clientX);
  }

  function updateDynamicTimers() {
    const now = isoNow();
    const sessionEnd = state.session.finishedAt || now;
    const elapsed = state.session.startedAt ? secondsBetween(state.session.startedAt, sessionEnd) : 0;
    $("sessionElapsed").textContent = formatClock(elapsed);

    if (state.session.phase === "work") {
      $("mainTimer").textContent = formatClock(secondsBetween(state.session.workStartedAt, now));
      return;
    }

    if (state.session.phase === "rest") {
      const elapsedRest = secondsBetween(state.session.restStartedAt, now);
      const target = cleanNumber(state.session.restTargetSec, 0, true);
      const remaining = target > 0 ? Math.max(0, target - elapsedRest) : elapsedRest;
      $("mainTimer").textContent = formatClock(remaining);
      return;
    }

    $("mainTimer").textContent = "00:00";
  }

  async function copyRecord() {
    const text = state.lastRecord ? JSON.stringify(state.lastRecord, null, 2) : $("recordJson").value;
    try {
      await navigator.clipboard.writeText(text);
      flashButton($("copyRecord"), "已复制");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      flashButton($("copyRecord"), "已选中");
    }
  }

  function downloadText(filename, text, type = "text/plain;charset=utf-8") {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportAllBackup() {
    const payload = {
      app: "gym-session-web",
      version: 1,
      exportedAt: isoNow(),
      template: state.template,
      templates: state.templates,
      activeTemplateId: state.activeTemplateId,
      currentSession: state.session?.status === "finished" ? null : state.session,
      history: state.history,
    };
    downloadText(`workout-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  }

  function csvValue(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function exportAnalysisCsv() {
    const rows = [
      ["date", "session_id", "exercise", "set_number", "reps", "weight_kg", "volume_kg", "estimated_1rm", "work_duration_sec", "rest_duration_sec"],
    ];
    sortedHistory().forEach((record) => {
      const date = (record.finishedAt || record.startedAt || "").slice(0, 10);
      (record.sets || []).forEach((set) => {
        const reps = cleanNumber(set.actualReps, 0, true);
        const weight = cleanNumber(set.actualWeight, 0);
        rows.push([
          date,
          record.id,
          set.exerciseName,
          set.setNumber,
          reps,
          weight,
          Math.round(reps * weight * 10) / 10,
          estimateOneRm(weight, reps),
          set.workDurationSec ?? "",
          set.restDurationSec ?? "",
        ]);
      });
    });
    downloadText(`workout-analysis-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((row) => row.map(csvValue).join(",")).join("\n"), "text/csv;charset=utf-8");
  }

  async function copyAnalysisSummary() {
    const text = buildAnalysisSummary();
    try {
      await navigator.clipboard.writeText(text);
      flashButton($("copyAnalysis"), "已复制");
    } catch {
      downloadText(`workout-summary-${new Date().toISOString().slice(0, 10)}.txt`, text);
      flashButton($("copyAnalysis"), "已下载");
    }
  }

  function importBackupFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result || "{}"));
        const importedHistory = Array.isArray(payload.history) ? payload.history : Array.isArray(payload) ? payload : null;
        if (!importedHistory) throw new Error("invalid backup");
        if (state.history.length && !window.confirm("导入会合并备份数据，保留同 ID 的最新记录。")) return;

        const merged = new Map(state.history.map((record) => [record.id, record]));
        importedHistory.forEach((record) => {
          if (record?.id) merged.set(record.id, record);
        });
        state.history = [...merged.values()].sort((a, b) => new Date(b.finishedAt || b.startedAt).getTime() - new Date(a.finishedAt || a.startedAt).getTime());
        if (Array.isArray(payload.templates) && payload.templates.length) {
          state.templates = payload.templates.map((template, index) => normalizeTemplate(template, `训练计划 ${index + 1}`)).filter((template) => template.exercises.length);
          state.activeTemplateId = payload.activeTemplateId || state.templates[0]?.id;
          setActiveTemplate(state.activeTemplateId);
          saveTemplates();
        } else if (payload.template?.exercises?.length) {
          state.template = normalizeTemplate(payload.template, "训练计划");
          state.templates = [state.template];
          state.activeTemplateId = state.template.id;
          saveTemplates();
        }
        saveHistory();
        renderAll();
        openPanel("data");
        flashButton($("importBackup"), "已导入");
      } catch {
        window.alert("导入失败：请选择本应用导出的备份 JSON。");
      } finally {
        $("importBackupFile").value = "";
      }
    };
    reader.readAsText(file);
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

    $("focusQueue")?.addEventListener("click", () => {
      openQueuePickMode();
    });

    $("undoAction").addEventListener("click", undoLastAction);
    $("finishWorkout").addEventListener("click", finishWorkout);
    $("finishWorkoutTop").addEventListener("click", finishWorkout);
    $("dockPlan")?.addEventListener("click", openQueueEditMode);
    $("dockRecord")?.addEventListener("click", () => {
      if (!state.lastRecord) return;
      renderRecord(state.lastRecord);
      openPanel("record");
    });
    $("dockData")?.addEventListener("click", () => openPanel("data"));
    $("dockHistory")?.addEventListener("click", () => openPanel("history"));
    $("dataToggle").addEventListener("click", () => openPanel("data"));
    $("nextStrip")?.addEventListener("click", openQueuePickMode);
    $("mobileScrim").addEventListener("click", () => {
      state.queuePickMode = false;
      closePanels({ hideSecondary: true });
    });
    $("closeQueue")?.addEventListener("click", () => {
      state.queuePickMode = false;
      closePanel("queue");
      renderQueue();
    });
    $("closeData").addEventListener("click", () => closePanel("data", true));
    $("closeHistory").addEventListener("click", () => closePanel("history", true));
    $("addExercise").addEventListener("click", () => openExerciseEditor("add"));
    $("planTabs").addEventListener("pointerdown", beginPlanPress);
    $("planTabs").addEventListener("pointermove", movePlanPress);
    $("planTabs").addEventListener("pointerup", finishPlanPress);
    $("planTabs").addEventListener("pointercancel", cancelPlanPress);
    $("planTabs").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-template-id]");
      if (!button) return;
      if (Date.now() < state.suppressPlanClickUntil) {
        event.preventDefault();
        return;
      }
      switchTemplate(button.dataset.templateId);
    });
    $("confirmOverwritePlan").addEventListener("click", overwriteActiveTemplate);
    $("confirmSaveAsPlan").addEventListener("click", saveAsNewTemplate);
    $("dismissPlanSave").addEventListener("click", closePlanSavePrompt);
    $("skipPlanSave").addEventListener("click", closePlanSavePrompt);
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

    $("exerciseList").addEventListener("pointerdown", beginQueuePointer);
    $("exerciseList").addEventListener("pointermove", moveQueuePointer, { passive: false });
    $("exerciseList").addEventListener("pointerup", finishQueuePointer);
    $("exerciseList").addEventListener("pointercancel", cancelQueuePointer);
    $("exerciseList").addEventListener("mousedown", beginQueueMouse);
    document.addEventListener("mousemove", moveQueueMouse);
    document.addEventListener("mouseup", finishQueueMouse);
    $("exerciseList").addEventListener("touchstart", beginQueueTouch, { passive: true });
    $("exerciseList").addEventListener("touchmove", moveQueueTouch, { passive: false });
    $("exerciseList").addEventListener("touchend", finishQueueTouch);
    $("exerciseList").addEventListener("touchcancel", () => cancelQueueGesture("touch"));
    $("exerciseList").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (Date.now() < state.suppressQueueClickUntil && button?.dataset.action !== "delete") {
        event.preventDefault();
        return;
      }
      if (!button) return;
      const row = event.target.closest(".exercise-row");
      const id = row?.dataset.id;
      const action = button.dataset.action;
      if (!id) return;

      if (action === "edit") {
        clearQueueTap();
        if (row.classList.contains("swiped")) {
          closeSwipedRows();
          return;
        }
        closeSwipedRows();
        openExerciseEditor("edit", id);
      }
      if (action === "pick") {
        handleQueuePick(row, id);
      }
      if (action === "delete") {
        clearQueueTap();
        closeSwipedRows();
        deleteExercise(id);
      }
    });

    $("copyRecord").addEventListener("click", copyRecord);
    $("exportBackup").addEventListener("click", exportAllBackup);
    $("exportCsv").addEventListener("click", exportAnalysisCsv);
    $("copyAnalysis").addEventListener("click", copyAnalysisSummary);
    $("importBackup").addEventListener("click", () => $("importBackupFile").click());
    $("importBackupFile").addEventListener("change", (event) => importBackupFile(event.target.files?.[0]));
    $("newSession").addEventListener("click", startNewSession);
    $("closeRecord").addEventListener("click", () => closePanel("record", true));

    $("historyToggle").addEventListener("click", () => {
      if ($("historySection").classList.contains("sheet-open") || !$("historySection").classList.contains("hidden")) closePanel("history", true);
      else openPanel("history");
    });

    $("historyList").addEventListener("pointerdown", beginHistoryPointer);
    $("historyList").addEventListener("pointermove", moveHistoryPointer, { passive: false });
    $("historyList").addEventListener("pointerup", finishHistoryPointer);
    $("historyList").addEventListener("pointercancel", (event) => cancelHistoryGesture(event.pointerId));
    $("historyList").addEventListener("mousedown", beginHistoryMouse);
    document.addEventListener("mousemove", moveHistoryMouse);
    document.addEventListener("mouseup", finishHistoryMouse);
    $("historyList").addEventListener("touchstart", beginHistoryTouch, { passive: true });
    $("historyList").addEventListener("touchmove", moveHistoryTouch, { passive: false });
    $("historyList").addEventListener("touchend", finishHistoryTouch);
    $("historyList").addEventListener("touchcancel", () => cancelHistoryGesture("history-touch"));
    $("historyList").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      if (Date.now() < state.suppressHistoryClickUntil && button.dataset.action !== "delete-history") {
        event.preventDefault();
        return;
      }
      const id = event.target.closest(".history-row")?.dataset.id;
      if (!id) return;
      if (button.dataset.action === "delete-history") {
        closeSwipedHistoryRows();
        deleteHistoryRecord(id);
        return;
      }
      if (button.dataset.action === "open-history") {
        const row = event.target.closest(".history-row");
        if (row.classList.contains("swiped")) {
          closeSwipedHistoryRows();
          return;
        }
        closeSwipedHistoryRows();
        const record = state.history.find((item) => item.id === id);
        if (!record) return;
        state.lastRecord = record;
        renderRecord(record);
        openPanel("record");
      }
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
    const storedTemplates = loadJson(STORE.templates, null);
    const legacyTemplate = loadJson(STORE.template, null);
    state.templates = Array.isArray(storedTemplates) && storedTemplates.length
      ? storedTemplates.map((template, index) => normalizeTemplate(template, `训练计划 ${index + 1}`)).filter((template) => template.exercises.length)
      : [normalizeTemplate(legacyTemplate || DEFAULT_TEMPLATE, "全身力量 A")].filter((template) => template.exercises.length);
    if (!state.templates.length) state.templates = [normalizeTemplate(DEFAULT_TEMPLATE, "全身力量 A")];
    state.activeTemplateId = loadJson(STORE.activeTemplateId, state.templates[0].id);
    setActiveTemplate(state.activeTemplateId);
    state.history = loadJson(STORE.history, []);
    state.session = loadJson(STORE.current, null) || createSessionFromTemplate(state.template);

    if (!Array.isArray(state.session.plan) || !state.session.plan.length) {
      state.session = createSessionFromTemplate(state.template);
    }
    if (!state.session.templateId) state.session.templateId = state.activeTemplateId;
    if (!state.session.templateName) state.session.templateName = state.template.name;
    saveTemplates();

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
