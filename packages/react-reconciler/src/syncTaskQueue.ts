// 同步任务调度逻辑
type SyncCallbackType = (...args: any[]) => void;
let syncQueue: SyncCallbackType[] | null = null;
let isFlushingSyncQueue = false; // 是否正在执行
export function scheduleSyncCallback(callback: SyncCallbackType) {
	if (syncQueue === null) {
		// 第一个同步调度函数
		syncQueue = [callback];
	} else {
		syncQueue.push(callback);
	}
}

export function flushSyncCallbacks() {
	// 遍历执行回调函数
	if (!isFlushingSyncQueue && syncQueue) {
		isFlushingSyncQueue = true;
		// 开始遍历处理
		try {
			syncQueue.forEach((cb) => cb());
		} catch (error) {
			if (__DEV__) {
				// 报错
				console.error('flushSyncCallbacks error:', error);
			}
		} finally {
			// 结束
			isFlushingSyncQueue = false;
			syncQueue = null;
		}
	}
}
