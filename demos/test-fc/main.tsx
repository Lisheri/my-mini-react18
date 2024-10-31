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
const Child = (props) => {
	const [count, setCount] = useState(1000);
	// window.setCount = setCount;
	return <span>{count}</span>;
};
const App = () => (
	<h1>
		{/* <span>test-mini-react</span> */}
		<Child text="Hello, World!" />
	</h1>
);

ReactDOM.createRoot(root!).render(<App />);

console.info(React);
console.info(App());
console.info(ReactDOM);