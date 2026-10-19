/** Test-only extension resolver for native Node 22 TypeScript stripping.
 * Vite supports extensionless TS imports but node --test does not.
 */
export async function resolve(specifier,context,nextResolve){
 if(specifier.startsWith(".")&&!/\.(?:ts|tsx|js|mjs|cjs|json)(?:[?#]|$)/i.test(specifier)){
  try{return await nextResolve(specifier+".ts",context);}
  catch(error){if(error?.code!=="ERR_MODULE_NOT_FOUND")throw error;}
 }
 return nextResolve(specifier,context);
}
