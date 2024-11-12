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

import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
// console.info(import.meta.hot);
const root = document.querySelector('#root');

// function Child2() {
// 	return <div>big-react</div>;
// }

const App = () => {
	const [num, setNum] = useState(0);
	useEffect(() => {
		console.info('app mount');
	}, []);
	useEffect(() => {
		console.info('num change create', num);
		return () => {
			console.info('num change destroy', num);
		};
	}, [num]);
	return (
		<div onClick={() => setNum(num + 1)}>{num === 0 ? <Child /> : 'noop'}</div>
	);
};

const Child = () => {
	useEffect(() => {
		console.info('child mount');
		return () => {
			console.info('child destroy');
		};
	}, []);
	return 'i am child';
};

ReactDOM.createRoot(root!).render(<App />);

console.info(React);
console.info(App());
console.info(ReactDOM);
