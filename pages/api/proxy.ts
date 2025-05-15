import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Solo permitir solicitudes POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  try {
    const targetUrl = req.query.url as string;
    
    if (!targetUrl) {
      res.status(400).json({ error: 'Se requiere parámetro "url"' });
      return;
    }

    const body = req.body;
    const csrfToken = req.headers['x-csrftoken'];

    console.log('Proxy: enviando solicitud a', decodeURIComponent(targetUrl));
    console.log('Proxy: body', JSON.stringify(body).substring(0, 200) + '...');

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (csrfToken) {
      headers['X-CSRFTOKEN'] = csrfToken as string;
    }

    const decodedUrl = decodeURIComponent(targetUrl);
    console.log('Proxy: URL decodificada:', decodedUrl);
    
    const response = await fetch(decodedUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      // Estos ajustes ayudan con ciertas configuraciones CORS
      credentials: 'include',
      mode: 'cors',
      cache: 'no-cache',
      redirect: 'follow',
    });

    // Obtener el tipo de contenido de la respuesta
    const contentType = response.headers.get('content-type');
    console.log('Proxy: respuesta recibida, status:', response.status, 'content-type:', contentType);

    // Copiar los headers relevantes de la respuesta original
    response.headers.forEach((value, key) => {
      // No copiar headers relacionados con CORS que podrían causar conflictos
      if (!['access-control-allow-origin', 'access-control-allow-credentials'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    // Manejar la respuesta según el tipo de contenido y el código de estado
    try {
      if (response.ok) {
        // Si la respuesta es exitosa
        if (contentType?.includes('application/json')) {
          // Si es JSON, parseamos y devolvemos como JSON
          const data = await response.json();
          res.status(response.status).json(data);
        } else {
          // Para otros tipos de contenido, devolvemos el texto
          const text = await response.text();
          
          // Intentamos parsear como JSON por si acaso
          try {
            const jsonData = JSON.parse(text);
            res.status(response.status).json(jsonData);
          } catch {
            // Si no es JSON, devolvemos como texto
            res.status(response.status).send(text);
          }
        }
      } else {
        // Si la respuesta tiene un código de error
        try {
          // Intentar obtener detalles del error
          const errorText = await response.text();
          let errorData;
          
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { message: errorText };
          }
          
          console.log('Proxy: error de la API remota:', response.status, errorData);
          res.status(response.status).json({
            error: `Error ${response.status}`,
            details: errorData,
            message: response.statusText
          });
        } catch (readError) {
          // Si no se puede leer la respuesta de error
          res.status(response.status).json({
            error: `Error ${response.status}`,
            message: response.statusText
          });
        }
      }
    } catch (parseError) {
      console.error('Error al procesar la respuesta:', parseError);
      res.status(500).json({
        error: 'Error al procesar la respuesta',
        details: (parseError as Error).message
      });
    }
  } catch (error) {
    console.error('Error en el proxy:', error);
    
    // Información detallada para ayudar a diagnosticar el problema
    const errorInfo = {
      error: 'Error en el servidor proxy', 
      details: (error as Error).message,
      url: req.query.url ? decodeURIComponent(req.query.url as string) : 'URL no proporcionada',
      csrfProvided: !!req.headers['x-csrftoken'],
      requestBodySize: req.body ? JSON.stringify(req.body).length : 'No hay cuerpo',
      stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined
    };
    
    console.error('Detalles del error:', JSON.stringify(errorInfo, null, 2));
    res.status(500).json(errorInfo);
  }
}
