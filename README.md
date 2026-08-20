# Inventario - módulo de trabajador

Aplicación web independiente para inventariar por ambiente.

## Uso

Para cargar automáticamente `inventario.xlsx`, haga doble clic en `iniciar-servidor.bat` y abra `http://localhost:8000` en Chrome o Edge. No abra `index.html` directamente con doble clic: por seguridad, el navegador no puede leer el Excel vecino en ese modo. Para usar la cámara en celular, publique esta carpeta en un servidor HTTPS (por ejemplo, GitHub Pages, Netlify o Vercel).

Los datos se guardan en el navegador mediante `localStorage`. Esta versión es un prototipo funcional: cuando se conecte PostgreSQL, se reemplazan las funciones `save()` y la carga inicial por llamadas a la API.

## Flujo

1. Seleccione Área, Local y Ambiente.
2. Escanee con cámara o digite el código patrimonial.
3. El bien se agrega o se mueve al ambiente seleccionado.
4. Edite su estado: Bueno, Regular o Malo. El cambio se guarda al instante.
5. Use **Importar Excel** para cargar el padrón de bienes. Se lee la primera hoja del archivo `.xlsx`, `.xls` o `.csv`.
6. Exporte el inventario actual a Excel o PDF.

## Importación de Excel

El archivo incluido `inventario.xlsx` se carga automáticamente la primera vez. Se reconocen las columnas `CODIGO_PATRIMONIAL`, `NOMBRE_LOCAL`, `NOMBRE_AREA`, `NOMBRE_OFICINA`, `DENOMINACION_BIEN`, `ESTADO_BIEN`, `MARCA`, `MODELO`, `TIPO`, `COLOR` y `SERIE`.

El código patrimonial es obligatorio. Las ubicaciones nuevas se crean automáticamente y, si un código ya existe, el bien se actualiza en vez de duplicarse. Las columnas de ubicación que no estén en el archivo se completan con la ubicación actualmente seleccionada. El inventario grande se guarda en IndexedDB, la base local del navegador, para evitar el límite de espacio de localStorage.
