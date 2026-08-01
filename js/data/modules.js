// IFoA exam modules — tracked at whole-exam level (A/B papers combined)
const MODULES = [
  { id:'CM1', name:'Actuarial Mathematics', color:'#3D6FD1' },
  { id:'CS1', name:'Actuarial Statistics',  color:'#2E9C8E' },
  { id:'CB1', name:'Business Finance',       color:'#6B5DD3' },
];

// Map any card/question module code (CM1A, CS1B, …) to its exam (CM1, CS1, CB1)
function examOf(moduleId){
  if(!moduleId) return moduleId;
  const m=String(moduleId).toUpperCase();
  if(m.startsWith('CM1')) return 'CM1';
  if(m.startsWith('CS1')) return 'CS1';
  if(m.startsWith('CB1')) return 'CB1';
  return moduleId;
}
