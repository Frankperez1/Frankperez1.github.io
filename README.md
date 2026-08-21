# Inventario - módulo de trabajador

Aplicación web independiente para inventariar por ambiente.

## Uso

Para cargar automáticamente `inventario.xlsx`, haga doble clic en `iniciar-servidor.bat` y abra `http://localhost:8000` en Chrome o Edge. No abra `index.html` directamente con doble clic: por seguridad, el navegador no puede leer el Excel vecino en ese modo. Para usar la cámara en celular, publique esta carpeta en un servidor HTTPS (por ejemplo, GitHub Pages, Netlify o Vercel).

Los datos se guardan en el navegador mediante IndexedDB (con respaldo en `localStorage`). Esta versión es un prototipo funcional: cuando se conecte PostgreSQL, se reemplazan las funciones `save()` y la carga inicial por llamadas a la API.

## Flujo

1. Seleccione **Local** (por ejemplo, "Ciudad Universitaria"), luego **Área** (por ejemplo, una Facultad) y luego **Ambiente** (oficina, aula o laboratorio).
2. Pulse **▶ Iniciar inventario**. Se le pedirá el nombre del encargado o encargados que están realizando el registro; ese dato queda asociado a cada bien escaneado y aparece en las exportaciones.
3. Recién entonces aparece la sección para escanear con cámara o digitar el código patrimonial.
4. El bien se agrega o se mueve al ambiente seleccionado. En la tabla, la columna **Ubicación registrada** (antes de "Estado") muestra el Ambiente en el que el bien fue originalmente cargado desde el Excel; si su Área original no coincide con el Área actual, la fila se resalta en rojo con una alerta ⚠. El selector de Ambiente se muestra ordenado alfabéticamente.
5. Edite el estado del bien: Bueno, Regular o Malo. El cambio se guarda al instante.
6. Use **Importar Excel** para cargar el padrón de bienes. Se lee la primera hoja del archivo `.xlsx`, `.xls` o `.csv`.
7. Exporte el inventario actual a Excel o PDF (incluye la ubicación registrada y los encargados de la sesión).
8. Al pulsar **Finalizar inventario**, se limpian los bienes escaneados del ambiente y la sesión se cierra: para el siguiente ambiente deberá volver a pulsar "Iniciar inventario" e indicar los encargados.

## Importación de Excel

El archivo incluido `inventario.xlsx` se carga automáticamente la primera vez. Se reconocen las columnas `CODIGO_PATRIMONIAL`, `NOMBRE_LOCAL`, `NOMBRE_AREA`, `NOMBRE_OFICINA`, `DENOMINACION_BIEN`, `ESTADO_BIEN`, `MARCA`, `MODELO`, `TIPO`, `COLOR` y `SERIE`.

El código patrimonial es obligatorio. Las ubicaciones nuevas se crean automáticamente y, si un código ya existe, el bien se actualiza en vez de duplicarse. Las columnas de ubicación que no estén en el archivo se completan con la ubicación actualmente seleccionada. El Área y el Ambiente originales de cada fila del Excel se guardan aparte (como "ubicación registrada") para poder compararlos contra el ambiente donde realmente se encuentra el bien al escanear. El inventario grande se guarda en IndexedDB, la base local del navegador, para evitar el límite de espacio de localStorage.

## Nota sobre datos anteriores

Si el navegador ya tenía datos guardados con la jerarquía anterior (Área > Local > Ambiente), la app los convierte automáticamente a la nueva jerarquía (Local > Área > Ambiente) la primera vez que se abre esta versión, sin perder bienes ni ambientes registrados.
