import { useMemo, useState, useEffect, useCallback } from 'react';
import Box from '@mui/system/Box';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import { DataGrid, GridColDef, GridToolbar } from '@mui/x-data-grid';
import { GridLogicOperator } from '@mui/x-data-grid';
import Button from '@mui/material/Button';
import SendIcon from '@mui/icons-material/Send';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Switch from '@mui/material/Switch';
import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import CircularProgress from '@mui/material/CircularProgress';
import Memory from 'components/Memory';
import MyHead from 'components/MyHead';
import Title from 'components/Title';
import lm3CalcCRI from 'lib/lm3calc';
import { LabHueSatChroma } from 'lib/Lab';
import { XYZnD65, xy2XYZ, XYZ2Lab } from 'lib/CIEConv';
import { calcCRI } from 'lib/cri';
import { useGlobalState, useMemoryRecall } from 'lib/global';
import useInterval from 'lib/use-interval';

const rowFormatter: { [key: string]: (value: never) => string } = {
	CCT: (value: number) => `${Math.round(value)} K`,
	x: (value: number) => `${value.toFixed(4)}`,
	y: (value: number) => `${value.toFixed(4)}`,
	u: (value: number) => `${value.toFixed(4)}`,
	v: (value: number) => `${value.toFixed(4)}`,
	Duv: (value: number) => value.toFixed(3),
	Tint: (value: number) => value.toFixed(0),
	Hue: (value: number) => `${value} deg`,
	Sat: (value: number) => `${(100 * value).toFixed(0)} %`,
	Illuminance: (value: number) => `${Math.round(value)} lx`,
	'Illuminance [fc]': (value: number) => `${Math.round(value)} ft⋅cd`,
	Ra: (value: number) => `${value.toFixed(0)}`,
	R0: (value: number) => `${value.toFixed(0)}`,
	R1: (value: number) => `${value.toFixed(0)}`,
	R2: (value: number) => `${value.toFixed(0)}`,
	R3: (value: number) => `${value.toFixed(0)}`,
	R4: (value: number) => `${value.toFixed(0)}`,
	R5: (value: number) => `${value.toFixed(0)}`,
	R6: (value: number) => `${value.toFixed(0)}`,
	R7: (value: number) => `${value.toFixed(0)}`,
	R8: (value: number) => `${value.toFixed(0)}`,
	R9: (value: number) => `${value.toFixed(0)}`,
	R10: (value: number) => `${value.toFixed(0)}`,
	R11: (value: number) => `${value.toFixed(0)}`,
	R12: (value: number) => `${value.toFixed(0)}`,
	R13: (value: number) => `${value.toFixed(0)}`,
	R14: (value: number) => `${value.toFixed(0)}`,
	Temperature: (value: number) => `${value.toFixed(2)} °C`,
};

const rowsSample = [{ id: 1, name: 'CCT', value: 5600 }];

const columnsTemplate: GridColDef<(typeof rowsSample)[number]>[] = [
	{ field: 'id', headerName: 'ID' },
	{
		field: 'name',
		headerName: 'Name',
		width: 120,
		hideable: false,
	},
	{
		field: 'value',
		headerName: 'Current',
		type: 'number',
		width: 120,
		sortable: false,
		hideable: false,
		getApplyQuickFilterFn: undefined,
		valueFormatter: (value, { name }) => rowFormatter[name](value || 0),
	},
];

function DataArray({ rows, pageSize = 5, filter }: { rows: typeof rowsSample; pageSize?: number; filter?: any }) {
	const recall = useMemoryRecall();
	const columns = [
		...columnsTemplate,
		...recall.map((rvalue, i) => ({
			...columnsTemplate[2],
			field: `recall${i}`,
			headerName: `${rvalue.name}`,
			hideable: true,
		})),
	];

	return (
		<Box sx={{ height: '100%', width: '100%' }}>
			<DataGrid
				rows={rows}
				columns={columns}
				initialState={{
					pagination: {
						paginationModel: {
							pageSize: pageSize,
						},
					},
					filter,
				}}
				columnVisibilityModel={{ id: false }}
				pageSizeOptions={[pageSize]}
				disableRowSelectionOnClick
				disableDensitySelector
				ignoreValueFormatterDuringExport
				slots={{ toolbar: GridToolbar }}
				slotProps={{
					toolbar: {
						showQuickFilter: true,
					},
				}}
			/>
		</Box>
	);
}

function calcHueSat(x: number, y: number, Lux: number) {
	const [X, Y, Z] = xy2XYZ(x, y, Lux);
	const [L, a, b] = XYZ2Lab(X, Y, Z, XYZnD65);

	return LabHueSatChroma(L, a, b);
}

function makeRecallCols(cols: number[]) {
	return cols.reduce((prev, cur, i) => ((prev[`recall${i}`] = cur), prev), {});
}

// Función para obtener la geolocalización actual
function getCurrentLocation(): Promise<{ latitude: number, longitude: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      () => {
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

// Función para enviar datos al servidor
async function sendDataToServer(data: any, url: string, token?: string): Promise<boolean> {
  try {
    if (!url) {
      console.error("URL no válida para el envío");
      return false;
    }
    
    // Construimos la estructura esperada por la API de OpenRed
    const location = data.metadata.location || { latitude: 0, longitude: 0 };
    const formattedPayload = {
      device: 1, // ID del dispositivo Light Master 3
      user: 1,   // ID de usuario, esto podría ser configurable
      latitude: location.latitude || 0,
      longitude: location.longitude || 0,
      altitude: 0, // La API podría no proporcionar altitud
      values: {
        // Incluimos todos los datos de medición
        measurement: data.measurement,
        recalled: data.recalled,
        formattedData: data.formattedData
      },
      dateTime: data.metadata.timestamp,
      accuracy: location.accuracy || 0,
      unit: "lux", // Unidad principal de medición
      notes: `Medición de Light Master 3 - CCT: ${data.measurement.CCT.toFixed(0)}K, Lux: ${data.measurement.Lux.toFixed(0)}`,
      weather: {},  // Campo opcional para datos meteorológicos
      auto_send: data.metadata.autoSend || false // Indicador si fue enviado automáticamente
    };

    // Determinamos si estamos en desarrollo o producción
    const isLocalhost = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    
    let response;
    let result;
    
    if (isLocalhost) {
      // En desarrollo, usamos nuestro proxy para evitar CORS
      console.log('Usando proxy local para evitar CORS');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      // Añadimos el token CSRF si está disponible
      if (token) {
        headers['X-CSRFTOKEN'] = token;
      }

      // Usar el proxy API route
      response = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(formattedPayload)
      });
    } else {
      // En producción, intentamos la conexión directa
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'accept': 'application/json'
      };
      
      // Añadimos el token CSRF si está disponible
      if (token) {
        headers['X-CSRFTOKEN'] = token;
      }
      
      response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(formattedPayload)
      });
    }
    
    if (!response.ok) {
      let errorMessage;
      try {
        const errorData = await response.json();
        errorMessage = `Error ${response.status}: ${JSON.stringify(errorData)}`;
      } catch (e) {
        errorMessage = `Error ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }
    
    result = await response.json();
    console.log('Datos enviados correctamente:', result);
    return true;
  } catch (error) {
    console.error('Error al enviar datos:', error);
    return false;
  }
}

export default function Text() {
	const [meas] = useGlobalState('res_lm_measurement');
	const [apiUrl, setApiUrl] = useGlobalState('apiUrl') || useState('');
	const [csrfToken, setCsrfToken] = useGlobalState('csrfToken') || useState('');
	const [sending, setSending] = useState(false);
	const [sendDialogOpen, setSendDialogOpen] = useState(false);
	const [tempUrl, setTempUrl] = useState('');
	const [tempToken, setTempToken] = useState('');
	const [sendResult, setSendResult] = useState<{success: boolean, message: string} | null>(null);
	const recall = useMemoryRecall();
	
	// Estado para el envío automático
	const [autoSendEnabled, setAutoSendEnabled] = useState(false);
	const [autoSendInterval, setAutoSendInterval] = useState(5000); // 5 segundos por defecto
	const [lastSentTimestamp, setLastSentTimestamp] = useState<Date | null>(null);
	const [autoSendCount, setAutoSendCount] = useState(0); // Contador de envíos automáticos
	
	// Calcular datos de filas para la tabla
	const rows = useMemo(() => {
		const { hab: hue, sat } = calcHueSat(meas.Ex, meas.Ey, meas.Lux);
		const cri = lm3CalcCRI(meas);
		const recallCri = recall.map(({ type: t, meas: rMeas }) =>
			// @ts-ignore
			t === 'LM3' ? lm3CalcCRI(rMeas) : t === 'ref' ? calcCRI(rMeas.CCT, rMeas.SPD) : null
		);
		const array = [
			{ id: 0, name: 'CCT', value: meas.CCT, ...makeRecallCols(recall.map((item) => item.meas.CCT)) },
			{ id: 0, name: 'x', value: meas.Ex, ...makeRecallCols(recall.map((item) => item.meas.Ex)) },
			{ id: 0, name: 'y', value: meas.Ey, ...makeRecallCols(recall.map((item) => item.meas.Ey)) },
			{ id: 0, name: 'u', value: meas.Eu, ...makeRecallCols(recall.map((item) => item.meas.Eu)) },
			{ id: 0, name: 'v', value: meas.Ev, ...makeRecallCols(recall.map((item) => item.meas.Ev)) },
			{ id: 0, name: 'Duv', value: meas.Duv, ...makeRecallCols(recall.map((item) => item.meas.Duv)) },
			{ id: 0, name: 'Tint', value: meas.tint, ...makeRecallCols(recall.map((item) => item.meas.tint)) },
			{
				id: 0,
				name: 'Hue',
				value: hue,
				...makeRecallCols(recall.map((item) => calcHueSat(item.meas.Ex, item.meas.Ey, item.meas.Lux).hab)),
			},
			{
				id: 0,
				name: 'Sat',
				value: sat,
				...makeRecallCols(recall.map((item) => calcHueSat(item.meas.Ex, item.meas.Ey, item.meas.Lux).sat)),
			},
			{ id: 0, name: 'Illuminance', value: meas.Lux, ...makeRecallCols(recall.map((item) => item.meas.Lux)) },
			{
				id: 0,
				name: 'Illuminance [fc]',
				value: meas.Lux * 0.09293680297,
				...makeRecallCols(recall.map((item) => item.meas.Lux * 0.09293680297)),
			},
			{
				id: 0,
				name: 'Ra',
				value: Math.round(cri.R[0]),
				...makeRecallCols(recall.map((_, i) => recallCri[i].R[0])),
			},
			...Array.from({ length: 14 }).map((_, i) => ({
				id: 0,
				name: `R${i + 1}`,
				value: Math.round(cri.R[i + 1]),
				...makeRecallCols(recallCri.map((cri) => cri.R[i + 1])),
			})),
			{
				id: 0,
				name: 'Temperature',
				value: meas.temperature,
				// @ts-ignore
				...makeRecallCols(recall.map((item) => item.meas?.temperature || 20)),
			},
		];
		for (let i = 0; i < array.length; i++) array[i].id = i;
		return array;
	}, [meas, recall]);
	
	// Función para preparar y enviar los datos
	const prepareAndSendData = useCallback(async (isAuto = false) => {
		if (!apiUrl && !isAuto) {
			console.log('No se puede enviar: URL de API no configurada');
			setSendResult({
				success: false,
				message: "Error: URL de API no configurada"
			});
			return false;
		}
		
		const targetUrl = isAuto ? apiUrl : tempUrl;
		const targetToken = isAuto ? csrfToken : tempToken;
		
		try {
			setSending(true);
			
			// Preparar los datos para enviar
			const dataToSend = {
				measurement: meas,
				recalled: recall,
				formattedData: rows,
				metadata: {
					timestamp: new Date().toISOString(),
					device: "Light Master 3",
					location: await getCurrentLocation(),
					autoSend: isAuto
				}
			};
			
			const success = await sendDataToServer(dataToSend, targetUrl, targetToken);
			
			if (success) {
				const now = new Date();
				setLastSentTimestamp(now);
				
				if (isAuto) {
					setAutoSendCount(prev => prev + 1);
					setSendResult({
						success: true,
						message: `Envío automático #${autoSendCount + 1} completado a las ${now.toLocaleTimeString()}`
					});
				} else {
					setSendResult({
						success: true,
						message: `Datos enviados manualmente con éxito`
					});
				}
			} else {
				setSendResult({
					success: false,
					message: isAuto 
						? "Error en el envío automático. Verifica la conexión y la URL."
						: "Error en el envío manual. Verifica la conexión y la URL."
				});
			}
			
			return success;
		} catch (error) {
			console.error(`Error en el envío ${isAuto ? 'automático' : 'manual'}:`, error);
			setSendResult({
				success: false,
				message: `Error: ${(error as Error).message}`
			});
			return false;
		} finally {
			setSending(false);
		}
	}, [meas, recall, rows, apiUrl, csrfToken, tempUrl, tempToken, autoSendCount]);
	
	// Configurar el intervalo de envío automático
	useInterval(async () => {
		if (autoSendEnabled && apiUrl && !sending) {
			console.log(`Ejecutando envío automático #${autoSendCount + 1}...`);
			await prepareAndSendData(true);
		}
	}, autoSendEnabled ? autoSendInterval : null);
	
	// Detener el envío automático si hay un problema con la URL
	useEffect(() => {
		if (autoSendEnabled && !apiUrl) {
			setAutoSendEnabled(false);
			setSendResult({
				success: false,
				message: "Envío automático desactivado: URL no configurada"
			});
		}
	}, [apiUrl, autoSendEnabled]);
	
	const handleSendDialogOpen = () => {
		setTempUrl(apiUrl || 'https://openred.ibercivis.es/api/measurements/');
		setTempToken(csrfToken || '');
		setSendDialogOpen(true);
	};
	
	const handleSendDialogClose = () => {
		setSendDialogOpen(false);
	};
	
	const handleSendData = async () => {
		setSendDialogOpen(false);
		
		// Guardar la URL y token para futuros envíos
		if (apiUrl !== tempUrl) {
			setApiUrl(tempUrl);
		}
		
		if (csrfToken !== tempToken) {
			setCsrfToken(tempToken);
		}
		
		// Usar la función común para enviar datos
		await prepareAndSendData(false);
	};

	return (
		<Container maxWidth="md">
			<MyHead />
			<Box position="relative" sx={{ flexGrow: 1 }}>
				<Title>OLM - Text</Title>
				<Paper>
					<Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 2 }}>
						<Box sx={{ display: 'flex', alignItems: 'center' }}>
							<Button 
								variant="contained" 
								color="primary" 
								startIcon={<SendIcon />}
								onClick={handleSendDialogOpen}
								disabled={sending}
								sx={{ mr: 2 }}
							>
								{sending ? "Enviando..." : "Enviar datos"}
							</Button>
							
							<FormGroup sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
								<FormControlLabel 
									control={
										<Switch 
											checked={autoSendEnabled} 
											onChange={() => setAutoSendEnabled(!autoSendEnabled)}
											color="primary"
											disabled={sending || !apiUrl}
										/>
									}
									label="Envío automático" 
								/>
								{autoSendEnabled && (
									<Button
										size="small"
										variant="outlined"
										onClick={() => {
											// Dialog para configurar intervalo
											const newInterval = window.prompt("Intervalo en segundos (entre 1 y 60):", (autoSendInterval/1000).toString());
											if (newInterval) {
												const interval = Math.min(60, Math.max(1, parseInt(newInterval))) * 1000;
												setAutoSendInterval(interval);
											}
										}}
										startIcon={<AutorenewIcon />}
										sx={{ ml: 1 }}
									>
										Cada {autoSendInterval/1000} seg
									</Button>
								)}
								{lastSentTimestamp && (
									<Box sx={{ ml: 2, fontSize: '0.8rem', color: 'text.secondary' }}>
										Último: {lastSentTimestamp.toLocaleTimeString()}
									</Box>
								)}
							</FormGroup>
						</Box>
						<Box sx={{ paddingTop: 1, paddingRight: 1 }}>
							<Memory />
						</Box>
					</Box>
					<DataArray
						rows={rows}
						pageSize={9}
						filter={{
							filterModel: {
								items: [],
								quickFilterValues: ['CCT', 'x', 'y', 'u', 'v', 'Illuminance', 'Ra'],
								quickFilterLogicOperator: GridLogicOperator.Or,
							},
						}}
					/>
				</Paper>
			</Box>
			
			{/* Diálogo para configurar URL */}
			<Dialog open={sendDialogOpen} onClose={handleSendDialogClose}>
				<DialogTitle>Enviar datos de medición a OpenRed</DialogTitle>
				<DialogContent>
					<DialogContentText>
						Introduzca la URL y el token CSRF para enviar los datos a OpenRed.
					</DialogContentText>
					<TextField
						autoFocus
						margin="dense"
						label="URL"
						type="url"
						fullWidth
						variant="outlined"
						value={tempUrl}
						onChange={(e) => setTempUrl(e.target.value)}
					/>
					<TextField
						margin="dense"
						label="Token CSRF"
						fullWidth
						variant="outlined"
						value={tempToken}
						onChange={(e) => setTempToken(e.target.value)}
						helperText="El token X-CSRFTOKEN para autenticación (opcional)"
					/>
					{typeof window !== 'undefined' && 
						(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
						<Alert severity="info" sx={{ mt: 2 }}>
							En entorno de desarrollo local, se utilizará el proxy API para evitar errores CORS.
						</Alert>
					)}
				</DialogContent>
				<DialogActions>
					<Button onClick={handleSendDialogClose}>Cancelar</Button>
					<Button 
						onClick={handleSendData} 
						variant="contained" 
						color="primary"
						disabled={!tempUrl}
					>
						Enviar
					</Button>
				</DialogActions>
			</Dialog>
			
			{/* Notificación de resultado */}
			<Snackbar 
				open={sendResult !== null} 
				autoHideDuration={6000} 
				onClose={() => setSendResult(null)}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
			>
				<Alert 
					onClose={() => setSendResult(null)} 
					severity={sendResult?.success ? "success" : "error"}
					variant="filled"
					sx={{ width: '100%' }}
				>
					{sendResult?.message}
				</Alert>
			</Snackbar>
			
			{/* Indicador de carga durante el envío */}
			{sending && (
				<Box
					sx={{
						position: 'fixed',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: 'rgba(0, 0, 0, 0.5)',
						display: 'flex',
						justifyContent: 'center',
						alignItems: 'center',
						zIndex: 9999,
					}}
				>
					<CircularProgress color="inherit" />
				</Box>
			)}
		</Container>
	);
}
