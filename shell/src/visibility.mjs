export function createVisibilityController(adapter, initialVisible = false) {
  let visible = Boolean(initialVisible);
  const history = [];
  let pending = Promise.resolve();

  function enqueue(operation) {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
  }

  async function commitVisibility(next, source) {
    if (next === visible) return visible;
    if (next) {
      await adapter.show();
      await adapter.focus();
    } else {
      await adapter.hide();
    }
    visible = next;
    history.push({ source, visible });
    return visible;
  }

  function applyVisibility(nextVisible, source) {
    return enqueue(() => commitVisibility(Boolean(nextVisible), source));
  }

  return Object.freeze({
    isVisible: () => visible,
    events: () => history.map((event) => ({ ...event })),
    setVisible: (nextVisible, source = "explicit") => applyVisibility(nextVisible, source),
    toggle: (source) => enqueue(() => commitVisibility(!visible, source))
  });
}
