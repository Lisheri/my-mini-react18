// 类型定义(暂时定义为any)
export type Type = any;
export type Key = any;
export type Ref = any;
export type Props = any;
export type ElementType = any;

export interface ReactElement {
	$$typeof: symbol | number;
	type: ElementType;
	key: Key;
	ref: Ref;
	props: Props;
	__mark: string;
}

// 对应两种调用setState触发更新的方式
export type Action<State> = State | ((prevState: State) => State);
