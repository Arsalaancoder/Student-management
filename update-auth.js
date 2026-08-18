const fs = require('fs');

const files = ['src/pages/auth/Signup.tsx', 'src/pages/auth/ForgotPassword.tsx'];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Update inputs
    content = content.replace(/<Input\s+id=/g, '<Input className="h-12 bg-slate-50 border-none rounded-2xl focus-visible:ring-primary/20 transition-all" id=');
    
    // Update button
    content = content.replace(/className="w-full text-base py-6 mt-4"/g, 'className="w-full text-base py-6 mt-4 rounded-2xl transition-all duration-300 hover:shadow-md hover:-translate-y-0.5"');
    
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
  }
});
