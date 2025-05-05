 #!/bin/bash

# Get the list of all process IDs returned by "ps -a"
pids=$(ps -a -o pid=)

# Loop through each PID and kill the process with "kill -9"
for pid in $pids; 
do
  kill -9 $pid
  echo "Killed process $pid"
done


# ps -a
# python3 -m vigision
# cd web/
# npm run dev
            