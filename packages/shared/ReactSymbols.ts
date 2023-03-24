// 为了防止 ReactElement被滥用, 因此需要将 ReactElement 定义为一个 独一无二的值

// 用于判断当前宿主环境是否支持Symbol
const supportSymbol = typeof Symbol === 'function' && Symbol.for;

// 用于标识 ReactElement类型
export const REACT_ELEMENT_TYPE = supportSymbol
	? Symbol.for('react.element')
	: 0xeac7;
