import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Remove all dark classes
code = code.replace(/ dark:[^ \n"']+/g, '');

fs.writeFileSync('src/App.tsx', code);
console.log('Removed dark mode classes from App.tsx');
