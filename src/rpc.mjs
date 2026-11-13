export async function rpc(type, fields = {}, signal) {
  const requestId = crypto.randomUUID();
  if (signal?.aborted) throw new DOMException("请求已取消", "AbortError");
  const cancel = () => {
    chrome.runtime.sendMessage({ type: "Cancel", requestId }).catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  let response;
  try {
    response = await chrome.runtime.sendMessage({ type, requestId, ...fields });
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
  if (signal?.aborted) throw new DOMException("请求已取消", "AbortError");
  if (!response?.ok)
    throw new Error(response?.error || "扩展后台暂不可用，请刷新页面");
  return response.value;
}
