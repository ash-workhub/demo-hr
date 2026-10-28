// src/components/views/ViewPlaceholder.jsx
// Shared placeholder for views not yet implemented. Shows the view name,
// what's coming, and which step will build it.
export default function ViewPlaceholder({ title, step, description, role }) {
  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center text-xl font-bold shrink-0">
            {step}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-500 mt-1">{description}</p>
            <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-sm text-slate-600">
                <span className="font-semibold">Status:</span> Scaffolded in Step 4.
                Implementation lands in <span className="font-semibold">Step {step}</span>.
              </p>
              {role && (
                <p className="text-xs text-slate-400 mt-2">
                  Your role ({role}) will see this view{role === 'employee' ? ' with limited actions' : ' with elevated permissions'}.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
