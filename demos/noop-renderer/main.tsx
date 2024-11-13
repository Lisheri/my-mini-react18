import React from 'react';
import { createRoot } from 'react-noop-renderer/src/root';
// console.info(import.meta.hot);

// const root = document.querySelector('#root');
function App() {
	return (
		<>
			<Child />
			<div>hello world</div>
		</>
	);
}

function Child() {
	return 'child';
}

const root = createRoot();

root.render(<App />);

window.root = root;
