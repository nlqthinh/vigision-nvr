import json
import requests


tunnel_url = requests.get("http://host.docker.internal:4040/api/tunnels").text
j = json.loads(tunnel_url)
tunnel_url = j['tunnels'][0]['public_url']
print(tunnel_url)