import React from 'react'
import Button from './button'
import Slider from './slider'
import xPlayer from 'xbox-xcloud-player'
import Loader from './loader'
import Card from './card'
import uPlot from 'uplot'
import Ipc from '../../lib/ipc'

interface StreamComponentProps {
    onDisconnect?: () => void;
    onMenu?: () => void;
    xPlayer: xPlayer;
}

function StreamComponent({
    onDisconnect,
    onMenu,
    xPlayer,
}: StreamComponentProps) {

    function performance_now_seconds() {
        return performance.now() / 1000.0
    }

    let lastMovement = 0
    // let gamebarElement = document.getElementById('component_streamcomponent_gamebar')
    let debugElement = document.getElementById('component_streamcomponent_debug')
    let webRtcStatsInterval

    const [micStatus, setMicStatus] = React.useState(false)
    const [waitingSeconds, setWaitingSeconds] = React.useState(0) // eslint-disable-line @typescript-eslint/no-unused-vars



    //Client-side volume control 
    const [volume, setVolume] = React.useState(1.0) //without any controls, the volume has been maxed by default, let's follow this assumption and start at full for our slider
    let audioElement = document.getElementsByTagName('audio')[0]
    const handleVolumeChange = (newVolume: number) => {

        //not sure if it is possible for us to be running this script without an audio element present hence lazy error checking here
        if (audioElement == null)
            audioElement = document.getElementsByTagName('audio')[0]

        if (audioElement) {
            setVolume(newVolume)
            audioElement.volume = newVolume
        } else {
            console.error('VolumeSlider: handleChange: failed to find current or lost previous audioelement')
        }

    }
    const volumeIcon = ( //from https://www.svgrepo.com/svg/502904/volume-low and optimized w/ https://jakearchibald.github.io/svgomg/
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 14v-4a1 1 0 0 1 1-1h2.65a1 1 0 0 0 .624-.22l3.101-2.48A1 1 0 0 1 16 7.08v9.84a1 1 0 0 1-1.625.78l-3.101-2.48a1 1 0 0 0-.625-.22H8a1 1 0 0 1-1-1Z" /></svg>
    )


    let jitterData = [new Float32Array([performance_now_seconds()]), new Float32Array([0.0])]
    let droppedData = [new Float32Array([performance_now_seconds()]), new Float32Array([0.0]), new Float32Array([0.0])]
    let framesDroppedBaseline = 0
    let packetsDroppedBaseline = 0
    let frameCountDomUpdate = 0


    function sliceData(data, start, end) {
        const d = []

        for (let i = 0; i < data.length; i++)
            d.push(data[i].slice(start, end))

        return d
    }

    React.useEffect(() => {

        Ipc.onAction('streaming', 'onQueue', (event, waitingTimes) => {
            console.log('Waiting times:', waitingTimes)
            drawWaitingTimes(waitingTimes.estimatedTotalWaitTimeInSeconds)
        })

        // ipcRenderer.on('xcloud', (event, args) => {
        //   console.log('GOT EVENT:', event, args)

        //   if(args.type === 'waitingtimes'){
        //     // Render countdown
        //     console.log('Seconds waiting time:', args.data.estimatedTotalWaitTimeInSeconds)
        //     // setWaitingTimes(args.data)
        //     drawWaitingTimes(args.data.estimatedTotalWaitTimeInSeconds)
        //   }
        // })

        const jitterUplot = new uPlot({
            title: 'Jitter (ms)',
            id: 'component_streamcomponent_debug_webrtc_jitter',
            class: 'debug-chart',
            width: 600,
            height: 230,
            scales: {
                'x': {
                    time: false,
                },
            },
            series: [
                {},
                {
                    show: true,
                    spanGaps: false,
                    label: 'Jitter',
                    stroke: 'red',
                    width: 2,
                    fill: 'rgba(255, 0, 0, 0.3)',
                },
            ],
            axes: [
                {
                    values: (u, vals) => vals.map(v => +v),
                },
                {
                    size: 50,
                    stroke: 'red',
                    values: (u, vals) => vals.map(v => (+v * 1000.0).toFixed(1)),
                },
            ],
        }, jitterData, document.getElementById('component_streamcomponent_debug_webrtc_jitter'))

        const droppedUplot = new uPlot({
            title: 'Packets lost / Frames dropped',
            id: 'component_streamcomponent_debug_webrtc_dropped',
            class: 'debug-chart',
            width: 600,
            height: 230,
            scales: {
                'x': {
                    time: false,
                },
            },
            series: [
                {},
                {
                    show: true,
                    spanGaps: false,
                    label: 'Packets lost',
                    stroke: 'green',
                    width: 2,
                    fill: 'rgba(0, 255, 0, 0.3)',
                },
                {
                    show: true,
                    spanGaps: false,
                    label: 'Frames dropped',
                    stroke: 'blue',
                    width: 2,
                    fill: 'rgba(0, 0, 255, 0.3)',
                },
            ],
            axes: [
                {
                    values: (u, vals) => vals.map(v => +v),
                },
                {
                    size: 50,
                    stroke: 'green',
                    values: (u, vals) => vals.map(v => +v.toFixed(0)),
                    grid: { show: false },
                },
                {
                    side: 1,
                    stroke: 'blue',
                    values: (u, vals) => vals.map(v => +v.toFixed(0)),
                    grid: { show: false },
                },
            ],
        }, droppedData, document.getElementById('component_streamcomponent_debug_webrtc_dropped'))

        webRtcStatsInterval = setInterval(() => {
            if (xPlayer._webrtcClient !== undefined) {
                xPlayer._webrtcClient.getStats().then((stats) => {
                    let statsOutput = ''

                    stats.forEach((report) => {
                        if (report.type === 'inbound-rtp' && report.kind === 'video') {

                            if (jitterData[0].length > 1200) {
                                jitterData = sliceData(jitterData, jitterData[0].length - 1200, jitterData[0].length)
                            }
                            if (droppedData[0].length > 1200) {
                                droppedData = sliceData(droppedData, droppedData[0].length - 1200, droppedData[0].length)
                            }

                            jitterData[0] = new Float32Array([...Array.from(jitterData[0]), performance_now_seconds()])
                            jitterData[1] = new Float32Array([...Array.from(jitterData[1]), report['jitter']])

                            droppedData[0] = new Float32Array([...Array.from(droppedData[0]), performance_now_seconds()])
                            droppedData[1] = new Float32Array([...Array.from(droppedData[1]), report['packetsLost'] - packetsDroppedBaseline])
                            droppedData[2] = new Float32Array([...Array.from(droppedData[2]), report['framesDropped'] - framesDroppedBaseline])
                            packetsDroppedBaseline = report['packetsLost']
                            framesDroppedBaseline = report['framesDropped']

                            jitterUplot.setData(jitterData)
                            droppedUplot.setData(droppedData)

                            if (frameCountDomUpdate >= 15) {
                                Object.keys(report).forEach((statName) => {
                                    statsOutput += `<strong>${statName}:</strong> ${report[statName]}<br>\n`
                                })
                                document.querySelector('div#component_streamcomponent_debug_text').innerHTML = statsOutput
                                frameCountDomUpdate = 0
                            } else {
                                frameCountDomUpdate++
                            }
                        }
                    })

                    // document.querySelector('div#component_streamcomponent_debug_text').innerHTML = statsOutput;
                })
            }
        }, 33)

        // Gamebar menu mouse events
        const mouseEvent = () => {
            lastMovement = Date.now()
        }
        window.addEventListener('mousemove', mouseEvent)
        window.addEventListener('mousedown', mouseEvent)

        const mouseInterval = setInterval(() => {
            const gamebarElement = document.getElementById('component_streamcomponent_gamebar')
            if (gamebarElement === null) {
                return
            }

            if ((Date.now() - lastMovement) >= 2000) {
                if (!gamebarElement.className.includes('hidden')) {
                    gamebarElement.className = 'hidden'
                }

            } else {
                if (gamebarElement.className.includes('hidden')) {
                    gamebarElement.className = ''
                }
            }
        }, 100)

        // Keyboard events
        const keyboardPressEvent = (e) => {
            switch (e.keyCode) {
                case 126:
                    toggleDebug()
                    break
            }
        }
        window.addEventListener('keypress', keyboardPressEvent)

        // cleanup this component
        return () => {
            window.removeEventListener('mousemove', mouseEvent)
            window.removeEventListener('mousedown', mouseEvent)
            window.removeEventListener('keypress', keyboardPressEvent)
            clearInterval(mouseInterval)

            // ipcRenderer.removeAllListeners('xcloud');

            if (webRtcStatsInterval) {
                clearInterval(webRtcStatsInterval)
            }
            (document.getElementById('component_streamcomponent_debug_webrtc_jitter') !== null) ? document.getElementById('component_streamcomponent_debug_webrtc_jitter').innerHTML = '' : false;
            (document.getElementById('component_streamcomponent_debug_webrtc_dropped') !== null) ? document.getElementById('component_streamcomponent_debug_webrtc_dropped').innerHTML = '' : false
        }
    }, [])



    function toggleMic() {
        if (xPlayer.getChannelProcessor('chat').isPaused === true) {
            xPlayer.getChannelProcessor('chat').startMic()
            setMicStatus(true)
        } else {
            xPlayer.getChannelProcessor('chat').stopMic()
            setMicStatus(false)
        }
    }

    function streamDisconnect() {
        document.getElementById('streamComponentHolder').innerHTML = ''

        xPlayer.close()
    }

    function endStream() {
        if (confirm('Are you sure you want to end your stream?')) {
            document.getElementById('streamComponentHolder').innerHTML = ''
            onDisconnect()
            xPlayer.close()
        }
    }

    function toggleDebug() {
        if (debugElement === null) {
            debugElement = document.getElementById('component_streamcomponent_debug')
        }

        if (debugElement.className.includes('hidden')) {
            debugElement.className = ''
        } else {
            debugElement.className = 'hidden'
        }
    }

    function drawWaitingTimes(seconds) {
        if (seconds !== false) {
            setWaitingSeconds(seconds)

            const formattedWaitingTime = formatWaitingTime(seconds)
            const html = '<div>Estimated waiting time in queue: <span id="component_streamcomponent_waitingtimes_seconds">' + formattedWaitingTime + '</span></div>'

            document.getElementById('component_streamcomponent_waitingtimes').innerHTML = html

            const secondsInterval = setInterval(() => {
                seconds--
                setWaitingSeconds(seconds)

                if (document.getElementById('component_streamcomponent_waitingtimes') !== null) {
                    document.getElementById('component_streamcomponent_waitingtimes_seconds').innerText = formatWaitingTime(seconds)
                } else {
                    clearInterval(secondsInterval)
                }

                if (seconds === 0) {
                    clearInterval(secondsInterval)
                }
            }, 1000)
        }
    }

    function formatWaitingTime(rawSeconds: number): string {
        let formattedText = ''

        const hours = Math.floor(rawSeconds / 3600)
        const minutes = Math.floor((rawSeconds % 3600) / 60)
        const seconds = (rawSeconds % 3600) % 60

        if (hours > 0) {
            formattedText += hours + ' hour(s), '
        }

        if (minutes > 0) {
            formattedText += minutes + ' minute(s), '
        }

        if (seconds > 0) {
            formattedText += seconds + ' second(s).'
        }

        return formattedText
    }

    return (
        <React.Fragment>
            <div>
                <div id="streamComponentHolder">
                </div>

                <div id="component_streamcomponent_loader">
                    <Card className='padbottom'>
                        <h1>Loading...</h1>

                        <Loader></Loader>

                        <p>We are getting your stream ready...</p>
                        <p id="component_streamcomponent_connectionstatus"></p>

                        <p id="component_streamcomponent_waitingtimes"></p>
                    </Card>
                </div>

                <div id="component_streamcomponent_gamebar">
                    <div id="component_streamcomponent_gamebar_menu">
                        <div style={{
                            width: '25%',
                        }}>
                            <Button label={<span><i className="fa-solid fa-xmark"></i> End Stream</span>} title="End Stream" className='btn-cancel' onClick={() => {
                                endStream()
                            }}></Button> &nbsp;
                            <Button label={<span><i className="fa-solid fa-xmark"></i></span>} title="Disconnect" className='btn' onClick={() => {
                                streamDisconnect()
                            }}></Button>
                        </div>

                        <div style={{
                            marginLeft: 'auto',
                            marginRight: 'auto',
                        }}>
                            <Button label={<span><i className="fa-brands fa-xbox"></i> Menu</span>} title="Open Xbox menu" onClick={(e) => {
                                e.target.blur(); onMenu()
                            }}></Button> &nbsp;
                            <Button label={(micStatus === false) ? <span><i className="fa-solid fa-microphone-slash"></i> Muted</span> : <span><i className="fa-solid fa-microphone"></i> Active</span>} title={(micStatus === false) ? 'Enable mic' : 'Disable mic'} className={(micStatus === false) ? 'btn-cancel' : 'btn-primary'} onClick={(e) => {
                                e.target.blur(); toggleMic()
                            }}></Button>
                        </div>

                        <Slider
                            id="volume-slider"
                            min={0}
                            max={1}
                            step={0.01}
                            value={volume}
                            onChange={handleVolumeChange}
                            label="Volume"
                            svg={volumeIcon}
                        />

                        <div style={{
                            marginRight: 20,
                            width: '25%',
                            textAlign: 'right',
                        }}>
                            <Button label={<i className="fa-solid fa-bug"></i>} title="Debug" onClick={(e) => {
                                e.target.blur(); toggleDebug()
                            }}></Button>
                        </div>
                    </div>
                </div>

                <div id="component_streamcomponent_debug" className='hidden'>
                    <p>Debug:</p>

                    <div id="component_streamcomponent_debug_webrtc_jitter"></div>
                    <div id="component_streamcomponent_debug_webrtc_dropped"></div>

                    <div id="component_streamcomponent_debug_text"></div>
                </div>
            </div>
        </React.Fragment>
    )
}

export default StreamComponent
