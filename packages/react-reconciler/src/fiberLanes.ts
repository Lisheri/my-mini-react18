import { FiberRootNode } from './fiber';

export type Lane = number; // 所谓的Lane, 其实就是一个二进制的数字
export type Lanes = number; // 一组Lane, 作为Lane的集合

export const SyncLane: Lane = 0b001; // 同步Lane
export const NoLane: Lane = 0b000; // 无优先级Lane

export const NoLanes: Lanes = 0b000; // 初始状态的集合

export function mergeLanes(laneA: Lane, laneB: Lane): Lanes {
	// 这样就可以合并两个lane并且获得他们的集合
	return laneA | laneB;
}

export function requestUpdateLanes(): Lanes {
	// 当前我们只有一个SyncLane, 所以直接返回
	// 但是这里后续可以继续扩展, 为不同的事件产生不同优先级更新做准备
	// 这里可以根据触发情况不同, 返回不同的Lane
	return SyncLane;
}

// 找到lanes中优先级最高的lane
export function getHighestPriorityLane(lanes: Lanes): Lane {
	// 依据在于对应的 lane 越小, 优先级越高
	// 返回最靠右的那一位, 比如说 0b0011 -> ob0001, 0b1010 -> 0b0010
	// 只需要和自己的补码做与操作, 就可以得到最右边的1
	return lanes & -lanes;
}

// 从root.pendingLanes中移除lane
export function markRootFinished(root: FiberRootNode, lane: Lane) {
	root.pendingLanes &= ~lane;
}
