import {
	unstable_getCurrentPriorityLevel,
	unstable_IdlePriority,
	unstable_ImmediatePriority,
	unstable_NormalPriority,
	unstable_UserBlockingPriority
} from 'scheduler';
import { FiberRootNode } from './fiber';

export type Lane = number; // 所谓的Lane, 其实就是一个二进制的数字
export type Lanes = number; // 一组Lane, 作为Lane的集合

// 只要不是NoLane, 那么数值越低, 优先级越高（1越是靠右， 越是优先级搞）
export const SyncLane: Lane = 0b0001; // 同步Lane
// ? 比如说拖拽, 对于用户就是个连续输入
export const InputContinuousLane = 0b0010; // 输入连续Lane
export const DefaultLane = 0b0100;
export const IdleLane = 0b1000;
// 这里还需要增加更多的优先级, 对应Scheduler的五种优先级
export const NoLane: Lane = 0b0000; // 无优先级Lane

export const NoLanes: Lanes = 0b0000; // 初始状态的集合

export function mergeLanes(laneA: Lane, laneB: Lane): Lanes {
	// 这样就可以合并两个lane并且获得他们的集合
	return laneA | laneB;
}

export function requestUpdateLanes(): Lanes {
	// 当前我们只有一个SyncLane, 所以直接返回
	// 但是这里后续可以继续扩展, 为不同的事件产生不同优先级更新做准备
	// 这里可以根据触发情况不同, 返回不同的Lane
	// 这里需要从上下文环境中获取 Scheduler 优先级
	const currentSchedulerPriorityLevel = unstable_getCurrentPriorityLevel();
	// 将上下文的scheduler优先级转换为lane
	const lane = schedulerPriorityToLane(currentSchedulerPriorityLevel);
	return lane;
}

// 找到lanes中优先级最高的lane
export function getHighestPriorityLane(lanes: Lanes): Lane {
	// 依据在于对应的 lane 越小, 优先级越高
	// 返回最靠右的那一位, 比如说 0b0011 -> ob0001, 0b1010 -> 0b0010
	// 只需要和自己的补码做与操作, 就可以得到最右边的1
	return lanes & -lanes;
}

// 比较优先级是否足够
// 判断优先级是否足够并不是单纯的数字比较, 而是比较一个lane是否在一个lanes中, 如果在就够, 不在就不够
export function isSubsetOfLanes(set: Lanes, subset: Lane): boolean {
	return (set & subset) === subset;
}

// 从root.pendingLanes中移除lane
export function markRootFinished(root: FiberRootNode, lane: Lane) {
	root.pendingLanes &= ~lane;
}

// lane转调度器优先级
export function lanesToSchedulerPriority(lanes: Lanes) {
	const lane = getHighestPriorityLane(lanes);
	if (lane === SyncLane) {
		// 优先级最高
		return unstable_ImmediatePriority;
	}

	if (lane === InputContinuousLane) {
		// 连续输入
		return unstable_UserBlockingPriority;
	}

	if (lane === DefaultLane) {
		return unstable_NormalPriority;
	}

	return unstable_IdlePriority;
}

// 调度器优先级转换为lane
export function schedulerPriorityToLane(schedulerPriority: number): Lane {
	if (schedulerPriority === unstable_ImmediatePriority) {
		return SyncLane;
	}
	if (schedulerPriority === unstable_UserBlockingPriority) {
		return InputContinuousLane;
	}
	if (schedulerPriority === unstable_NormalPriority) {
		return DefaultLane;
	}
	return NoLane;
}
