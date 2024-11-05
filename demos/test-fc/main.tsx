// // import { StrictMode } from 'react'
// import { createRoot } from "react-dom/client";
// import "./index.css";
// import App from "./App.jsx";

// createRoot(document.getElementById("root")).render(
//     // <StrictMode>
//     //   <App />
//     // </StrictMode>,
//     <App />
// );

import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
// console.info(import.meta.hot);
const root = document.querySelector('#root');
const Child = () => {
	const [count, setCount] = useState(100);
	const arr =
		count % 2 === 0
			? [<li key="1">1</li>, <li key="2">2</li>, <li key="3">3</li>]
			: [<li key="3">3</li>, <li key="2">2</li>, <li key="1">1</li>];
	return <ul onClick={() => setCount(count + 1)}>{arr}</ul>;
};

// function Child2() {
// 	return <div>big-react</div>;
// }

const App = () => {
	/**
   * 
   * <h1></h1>
		<Child text="Hello, World!" />
   */
	// const [count, setCount] = useState(100);
	// const arr =
	// 	count % 2 === 0
	// 		? [<li key="1">1</li>, <li key="2">2</li>, <li key="3">3</li>]
	// 		: [<li key="3">3</li>, <li key="2">2</li>, <li key="1">1</li>];
	// return <ul onClick={() => setCount(count + 1)}>{arr}</ul>;
	// return <Child />
	return (
		<div>
			<Child />
		</div>
	);
};

ReactDOM.createRoot(root!).render(<App />);

console.info(React);
console.info(App());
console.info(ReactDOM);
