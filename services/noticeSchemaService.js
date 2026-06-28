// Fields are now baked directly into the Notice schema.
// This shim exists so existing code that calls ensureStepOneNoticeFields
// does not break.  It's a no‑op for the current schema.
function ensureStepOneNoticeFields(_Notice) {
  // all fields (likes, category enum with Emergency, priority) are defined
  // on the Notice schema directly – nothing to add at runtime.
}

module.exports = { ensureStepOneNoticeFields };
